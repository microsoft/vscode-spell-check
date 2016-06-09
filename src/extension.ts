'use strict';
import * as vscode from 'vscode';
import * as t from 'teacher';
import * as fs from 'fs';
import { Delayer } from './delayer';


interface SpellMDSettings {
    language: string,
    ignoreWordsList: string[];
    mistakeTypeToStatus: {}[];
    languageIDs: string[];
    ignoreRegExp: string[];
}

interface SPELLMDProblem {
    error: string;
    preContext: string;
    startLine: number;
    startChar: number;
    endLine: number;
    endChar: number;
    type: string;
    message: string;
    suggestions: string[];
}

interface Map<V> {
	[key: string]: V;
}

// GLOBALS ///////////////////
let settings: SpellMDSettings;
let problems: SPELLMDProblem[] = [];
let CONFIGFILE = vscode.workspace.rootPath + "/.vscode/spell.json";
let validationDelayer: Map<Delayer<void>> = Object.create(null); // key is the URI of the document

// Activate the extension
export function activate(disposables: vscode.Disposable[]) {
    console.log("Spell and Grammar checker active...");

    // TODO [p2] Currently the only way to refresh is to reload window, add a wacher
    settings = readSettings();

    vscode.commands.registerCommand('Spell.suggestFix', suggestFix);
    vscode.commands.registerCommand('Spell.changeLanguage', changeLanguage);

    // On first load instantly trigger
    TriggerCreateDiagnostics(vscode.window.activeTextEditor.document);

    // Link into the two critical lifecycle events
    vscode.workspace.onDidChangeTextDocument(event => {
        TriggerCreateDiagnostics(event.document)
    }, undefined, disposables);

    vscode.workspace.onDidOpenTextDocument(event => {
        TriggerCreateDiagnostics(event)
    }, undefined, disposables);
}


// Itterate through the errors and populate the diagnostics
function TriggerCreateDiagnostics(document: vscode.TextDocument) {
	let d = validationDelayer[document.uri.toString()];
    
    if (!d) {
        d = new Delayer<any>(150);
        validationDelayer[document.uri.toString()] = d;
    }
    d.trigger(() => {
        CreateDiagnostics(document);
        delete validationDelayer[document.uri.toString()];
    });
}


// Itterate through the errors and populate the diagnostics
function CreateDiagnostics(document: vscode.TextDocument) {
    let diagnostics: vscode.Diagnostic[] = [];
    let spellingErrors = vscode.languages.createDiagnosticCollection("spelling");
    let docToCheck = document.getText();

    // clear existing problems
    problems = [];

    if (settings.languageIDs.indexOf(document.languageId) !== -1) {
        // removeUnwantedText before processing the spell checker ignores a lot of chars so removing them aids in problem matching
        docToCheck = removeUnwantedText(docToCheck);
        docToCheck = docToCheck.replace(/[`\"!#$%&()*+,.\/:;<=>?@\[\]\\^_{|}]/g, " ");

        spellcheckDocument(docToCheck, (problems) => {
            for (let x = 0; x < problems.length; x++) {
                let problem = problems[x];
                let lineRange = new vscode.Range(problem.startLine, problem.startChar, problem.endLine, problem.endChar);
                let loc = new vscode.Location(document.uri, lineRange);

                let diag = new vscode.Diagnostic(lineRange, problem.message, convertSeverity(problem.type));
                diagnostics.push(diag);
            }
            spellingErrors.set(document.uri, diagnostics);
        });
    }
}

// when on an error suggest fixes
// TODO: [p2] This should really use a quickfix/lightbulb and not a QuickPick
function suggestFix() {
    let opts: vscode.QuickPickOptions = { matchOnDescription: true, matchOnDetail: true, placeHolder: "Here's a suggestion or two for..." };
    let items: vscode.QuickPickItem[] = [];
    let e = vscode.window.activeTextEditor;
    let d = e.document;
    let sel = e.selection;

    if (settings.languageIDs.indexOf(d.languageId) !== -1) {
        // TODO [p1] need to actually use the error context i.e. diagnostic start and end in the current location
        // The issue is that some grammar errors will be multiple words currently I just ignore them
        let wordRange: vscode.Range = d.getWordRangeAtPosition(sel.active);
        let word: string = d.getText(wordRange);

        // find the key data for the specific issue
        let problem: SPELLMDProblem = problems.filter(function (obj) {
            return obj.error === word;
        })[0];

        if (problem !== undefined) {
            if (problem.suggestions.length > 0) {
                for (let i = 0; i < problem.suggestions.length; i++) {
                    items.push({ label: problem.suggestions[i], description: "Replace [" + word + "] with [" + problem.suggestions[i] + "]" });
                }
            } else {
                items.push({ label: null, description: "No suggestions available sorry..." });
            }

        } else {
            items.push({ label: null, description: "No suggestions available sorry..." });
        }

        items.push({ label: "ADD TO IGNORE LIST", description: "Add [" + word + "] to ignore list." })

        // replace the text with the selection
        vscode.window.showQuickPick(items).then((selection) => {
            if (!selection) return;
            if (selection.label === "ADD TO IGNORE LIST") {
                settings.ignoreWordsList.push(word);
                updateSettings();
                CreateDiagnostics(vscode.window.activeTextEditor.document);
            } else {
                if (selection.label !== null) {
                    e.edit(function (edit) {
                        edit.replace(wordRange, selection.label);
                    });
                }
            }
        });
    } else {
        vscode.window.showInformationMessage("LanguageID: " + d.languageId + " not supported for spell checking.")
    }
}




// HELPER Get options from the settings file if one exists, otherwise use defaults
function readSettings(): SpellMDSettings {
    let cfg: any = readJsonFile(CONFIGFILE);

    function readJsonFile(file): any {
        try {
            cfg = JSON.parse(fs.readFileSync(file).toString());
        }
        catch (err) {
            cfg = JSON.parse('{\
                                "version": "0.1.0", \
                                "language": "en", \
                                "ignoreWordsList": [], \
                                "mistakeTypeToStatus": { \
                                    "Spelling": "Error", \
                                    "Passive Voice": "Information", \
                                    "Complex Expression": "Information",\
                                    "Hyphen Required": "Warning"\
                                    },\
                                "languageIDs": ["markdown","text"],\
                                "ignoreRegExp": []\
                              }');
        }

        //gracefully handle new fields
        if (cfg.languageIDs === undefined) cfg.languageIDs = ["markdown"];
        if (cfg.language === undefined) cfg.language = "en";
        if (cfg.ignoreRegExp === undefined) cfg.ignoreRegExp = [];

        return cfg;
    }

    return {
        language: cfg.language,
        ignoreWordsList: cfg.ignoreWordsList,
        mistakeTypeToStatus: cfg.mistakeTypeToStatus,
        languageIDs: cfg.languageIDs,
        ignoreRegExp: cfg.ignoreRegExp
    }
}

function updateSettings(): void {
    fs.writeFileSync(CONFIGFILE, JSON.stringify(settings));
}


// HELPER Map the mistake types to VS Code Diagnostic severity settings
function convertSeverity(mistakeType: string): number {
    let mistakeTypeToStatus: {}[] = settings.mistakeTypeToStatus;

    switch (mistakeTypeToStatus[mistakeType]) {
        case "Warning":
            return vscode.DiagnosticSeverity.Warning;
        case "Information":
            return vscode.DiagnosticSeverity.Information;
        case "Error":
            return vscode.DiagnosticSeverity.Error;
        case "Hint":
            return vscode.DiagnosticSeverity.Hint;
        default:
            return vscode.DiagnosticSeverity.Hint;
    }
}



// Take in a text doc and produce the set of problems for both the editor action and actions
// teacher does not return a line number and results are not in order - so a lot of the code is about 'guessing' a line number
function spellcheckDocument(content: string, cb: (report: SPELLMDProblem[]) => void): void {
    let problemMessage: string;
    let detectedErrors: any = {};
    let teach = new t.Teacher(settings.language);
    teach.check(content, function (err, docProblems) {
        if (docProblems != null) {
            for (let i = 0; i < docProblems.length; i++) {
                if (settings.ignoreWordsList.indexOf(docProblems[i].string) === -1) {
                    let problem = docProblems[i];
                    let problemTXT = problem.string;
                    let problemPreContext: string = (typeof problem.precontext !== "object") ? problem.precontext + " " : "";
                    let problemWithPreContent: string = problemPreContext + problemTXT;
                    let problemSuggestions: string[] = [];
                    let startPosInFile: number = -1;

                    // Check to see if this error has been seen before use the full context for improved uniqueness
                    // This is required as the same error can show up multiple times in a single doc - catch em all
                    if (detectedErrors[problemWithPreContent] > 0) {
                        startPosInFile = nthOccurrence(content, problemTXT, problemPreContext, detectedErrors[problemWithPreContent] + 1);
                    } else {
                        startPosInFile = nthOccurrence(content, problemTXT, problemPreContext, 1);
                    }

                    if (startPosInFile !== -1) {
                        let linesToMistake: String[] = content.substring(0, startPosInFile).split('\n');
                        let numberOfLinesToMistake: number = linesToMistake.length - 1;

                        if (!detectedErrors[problemWithPreContent]) detectedErrors[problemWithPreContent] = 1;
                        else ++detectedErrors[problemWithPreContent];

                        // make the suggestions an array even if only one is returned
                        if (String(problem.suggestions) !== "undefined") {
                            if (Array.isArray(problem.suggestions.option)) problemSuggestions = problem.suggestions.option;
                            else problemSuggestions = [problem.suggestions.option];
                        }

                        problems.push({
                            error: problemTXT,
                            preContext: problemPreContext,
                            startLine: numberOfLinesToMistake,
                            startChar: linesToMistake[numberOfLinesToMistake].length,
                            endLine: numberOfLinesToMistake,
                            endChar: linesToMistake[numberOfLinesToMistake].length + problemTXT.length,
                            type: problem.description,
                            message: problem.description + " [" + problemTXT + "] - suggest [" + problemSuggestions.join(", ") + "]",
                            suggestions: problemSuggestions
                        });
                    }
                }
            }
            cb(problems);
        }
    });
}


// HELPER recursive function to find the nth occurance of a string in an array
function nthOccurrence(content, problem, preContext, occuranceNo) {
    let firstIndex = -1;
    let regex = new RegExp(preContext + "[ ]*" + problem, "g");
    let m = regex.exec(content);

    if (m !== null) {
        let matchTXT = m[0];
        // adjust for any precontent and padding
        firstIndex = m.index + m[0].match(/^\s*/)[0].length;
        if (preContext !== "") {
            let regex2 = new RegExp(preContext + "[ ]*", "g");
            let m2 = regex2.exec(matchTXT);
            firstIndex += m2[0].length;
        }
    }

    let lengthUpToFirstIndex = firstIndex + 1;

    if (occuranceNo == 1) {
        return firstIndex;
    } else {
        let stringAfterFirstOccurrence = content.slice(lengthUpToFirstIndex);
        let nextOccurrence = nthOccurrence(stringAfterFirstOccurrence, problem, preContext, occuranceNo - 1);

        if (nextOccurrence === -1) {
            return -1;
        } else {
            return lengthUpToFirstIndex + nextOccurrence;
        }
    }
}

function getLanguageDescription(initial: string): string {
    switch (initial) {
        case "en":
            return "English";
        case "fr":
            return "French";
        case "de":
            return "German";
        case "pt":
            return "Portuguese";
        case "es":
            return "Spanish";
        default:
            return "English";
    }
}

function changeLanguage() {
    let items: vscode.QuickPickItem[] = [];

    items.push({ label: getLanguageDescription("en"), description: "en" });
    items.push({ label: getLanguageDescription("fr"), description: "fr" });
    items.push({ label: getLanguageDescription("de"), description: "de" });
    items.push({ label: getLanguageDescription("pt"), description: "pt" });
    items.push({ label: getLanguageDescription("es"), description: "es" });
    let index: number;
    for (let i = 0; i < items.length; i++) {
        let element = items[i];
        if (element.description == settings.language) {
            index = i;
            break;
        }
    }
    items.splice(index, 1);

    // replace the text with the selection
    vscode.window.showQuickPick(items).then((selection) => {
        if (!selection) return;

        settings.language = selection.description;
        updateSettings();
        CreateDiagnostics(vscode.window.activeTextEditor.document);
    });
}



function removeUnwantedText(content: string): string {
    let match;
    let expressions = settings.ignoreRegExp;

    for (let x = 0; x < expressions.length; x++) {
        // Convert the JSON of regExp Strings into a real RegExp
        let flags = expressions[x].replace(/.*\/([gimy]*)$/, '$1');
        let pattern = expressions[x].replace(new RegExp('^/(.*?)/' + flags + '$'), '$1');

        pattern = pattern.replace(/\\\\/g, "\\");
        let regex = new RegExp(pattern, flags);

        match = content.match(regex);
        if (match !== null) {
            // look for a multi line match and build enough lines into the replacement
            for (let i = 0; i < match.length; i++) {
                let spaces: string;
                let lines = match[i].split("\n").length;

                if (lines > 1) {
                    spaces = new Array(lines).join("\n");
                } else {
                    spaces = new Array(match[i].length + 1).join(" ");
                }
                content = content.replace(match[i], spaces);
            }
        }
    }
    return content;
}
