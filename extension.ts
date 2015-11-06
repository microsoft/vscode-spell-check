import {workspace, languages, Diagnostic, DiagnosticSeverity, Location, Range, Disposable, TextDocument, Position, QuickPickOptions, QuickPickItem, window, commands} from 'vscode';

let t = require('teacher');
import fs = require('fs');

let settings: SpellMDSettings;
let problems: SPELLMDProblem[] = [];
    

// Activate the extension
export function activate(disposables: Disposable[]) {
    console.log("Spell and Grammar checker active...");
    
    // load in the settings form an optional project specific setting file 
    settings= readSettings();

    // register the suggestion command for detected errors
    commands.registerCommand('Spell.suggestFix', suggestFix);

    // Link into the two critical lifecycle events
    workspace.onDidChangeTextDocument(event => {
        CreateDiagnostics(event.document)
    }, undefined, disposables);

    workspace.onDidOpenTextDocument(event => {
        CreateDiagnostics(event)
    }, undefined, disposables);
}


function suggestFix() {
    let opts: QuickPickOptions = { matchOnDescription: true, placeHolder: "Here's a suggestion or two for..." };
    let items: QuickPickItem[] = [];
    let e = window.activeTextEditor;
    let d = e.document;
    let sel = e.selection;
    
    // need to actually use the error context i.e. diagnostic start and end in the current location
    let wordRange: Range = d.getWordRangeAtPosition(sel.active);
    let word: string = d.getText(wordRange);
        
    // find the object for this issue    
    let problem: SPELLMDProblem = problems.filter(function(obj) {
        return obj.error === word;
    })[0];
            
    // provide suggestions
    for (let i = 0; i < problem.suggestions.length; i++) {
        items.push({ label: problem.suggestions[i], description: "Replace [" + word + "] with [" + problem.suggestions[i] + "]" });
    }

    // replace the text with the selection
    // TODO provide an add option, input
    window.showQuickPick(items).then((selection) => {
        if (!selection) return;
        e.edit(function(edit) {
            edit.replace(wordRange, selection.label);
        });
    });
}


// the settings supported
interface SpellMDSettings {
    enable: boolean;
    ignoreWordsList: string[];
    mistakeTypeToStatus: {}[];
    replaceRegExp: string[];
}

// HELPER Get options from the settings file if one exists, otherwise use defaults
// TODO Path is not working as exptected
function readSettings(): SpellMDSettings {
    let CONFIGFILE = ".vscode/spell.json";
    let cfg: any = readJsonFile(CONFIGFILE);

    function readJsonFile(file): any {
        try {
            cfg = JSON.parse(fs.readFileSync(file).toString());
        }
        catch (err) {
            cfg = JSON.parse('{\
                                "version": "0.1.0", \
                                "ignoreWordsList": [], \
                                "replaceRegExp": [ \
                                     "/^((`{3}\\\\s*)(\\\\w+)?(\\\\s*([\\\\w\\\\W]+?)\\\\n*)\\\\2)\\\\n*(?:[^\\\\S\\\\w\\\\s]|$)/gm", \
                                    "/\\\\]\\\\(([^\\\\)]+)\\\\)/g" \
                                    ], \
                                "mistakeTypeToStatus": { \
                                    "Spelling": "Error", \
                                    "Passive Voice": "Warning", \
                                    "Complex Expression": "Warning",\
                                    "Hyphen Required": "Error"}\
                                }');
        }
        return cfg;
    }

    return {
        enable: true,
        ignoreWordsList: cfg.ignoreWordsList,
        mistakeTypeToStatus: cfg.mistakeTypeToStatus,
        replaceRegExp: cfg.replaceRegExp
    }
}


// Match unwated markup and replace with lines or spaces
// other chekers use the opposite arroach of only including words
function removeUnwantedText(content: string): string {
    var match;
    var unwantedTXTMachers = settings.replaceRegExp;

    for (var x = 0; x < unwantedTXTMachers.length; x++) {
        // Convert the JSON of regExp Strings into a real RegExp
        var flags = unwantedTXTMachers[x].replace(/.*\/([gimy]*)$/, '$1');
        var pattern = unwantedTXTMachers[x].replace(new RegExp('^/(.*?)/' + flags + '$'), '$1');
        pattern = pattern.replace(/\\\\/g, "\\");
        var regex = new RegExp(pattern, flags);

        match = content.match(regex);
        if (match !== null) {
            // look for a multi line match and build enough lines into the replacement
            for (let i = 0; i < match.length; i++) {
                let spaces: string;
                let lin = match[i].split("\n").length;

                if (lin > 1) {
                    spaces = new Array(lin).join("\n");
                } else {
                    spaces = new Array(match[i].length + 1).join(" ");
                }
                content = content.replace(match[i], spaces);
            } //for
        }
    }
    return content;
}



function CreateDiagnostics(document: TextDocument) {
    let diagnostics: Diagnostic[] = [];
    let spellingErrors = languages.createDiagnosticCollection("spelling");
    problems = [];
    
    // do the actual checking and convert resultant list into diagnostics
    if (document.languageId === "markdown") {
        spellcheckDocument(document.getText(), (problems) => {
            for (let x = 0; x < problems.length; x++) {
                let problem = problems[x];
                let lineRange = new Range(problem.startLine, problem.startChar, problem.endLine, problem.endChar);
                let loc = new Location(document.uri, lineRange);

                let diag = new Diagnostic(lineRange, problem.message, convertSeverity(problem.type));
                diagnostics.push(diag);
            }
            spellingErrors.set(document.uri, diagnostics);
        });
    }
}

// HELPER Map the mistake types to VS Code Diagnostic severity settings
function convertSeverity(mistakeType: string): number {
    let mistakeTypeToStatus: {}[] = settings.mistakeTypeToStatus;

    switch (mistakeTypeToStatus[mistakeType]) {
        case "Warning":
            return DiagnosticSeverity.Warning;
            break;
        case "Information":
            return DiagnosticSeverity.Information;
            break;
        case "Error":
            return DiagnosticSeverity.Error;
            break;
        case "Hint":
            return DiagnosticSeverity.Hint;
            break;
        default:
            return DiagnosticSeverity.Information;
            break;
    }
}

// Take in a text doc and produce the set of problems for both the editor action and actions
function spellcheckDocument(content: string, cb: (report: SPELLMDProblem[]) => void): void {
    let problemMessage: string;
    let detectedErrors: any = {};

    content = removeUnwantedText(content);

    t.check(content, function(err, docIssues) {
        if (docIssues != null) {
            for (let i = 0; i < docIssues.length; i++) {
                if (settings.ignoreWordsList.indexOf(docIssues.string) === -1) {

                    let docIssue = docIssues[i];
                    let issueTXTPreContext: string = (typeof docIssue.precontext !== "object") ? docIssue.precontext + " " : "";
                    let issueTXTSearch: string = issueTXTPreContext + docIssue.string;
                    let issueSuggestions: string[] = [];
                    let startPosInFile: number = -1;

                    // Check to see if this error has been seen before use the full context for improved uniqueness
                    if (detectedErrors[issueTXTSearch] > 0) {
                        startPosInFile = nth_occurrence(content, issueTXTSearch, detectedErrors[issueTXTSearch] + 1);
                    } else {
                        startPosInFile = content.indexOf(issueTXTSearch);
                    }

                    // If there was a precontext used for uniquenss remove from position calculation
                    // a better set of tests for unique location https://github.com/Automattic/atd-jquery/blob/master/src/atd.core.js#L94
                    if (issueTXTPreContext.length > 0) {
                        startPosInFile += issueTXTPreContext.length;
                    }

                    if (startPosInFile !== -1) {
                        let linesToMistake: String[] = content.substring(0, startPosInFile).split('\n');
                        let numberOfLinesToMistake: number = linesToMistake.length - 1;

                        // use a counter for where the same error is found multiple times
                        if (!detectedErrors[issueTXTSearch]) {
                            detectedErrors[issueTXTSearch] = 0;
                            ++detectedErrors[issueTXTSearch];
                        } else {
                            ++detectedErrors[issueTXTSearch];
                        }

                        if (String(docIssue.suggestions) !== "undefined") {
                            if (Array.isArray(docIssue.suggestions.option)) {
                                issueSuggestions = docIssue.suggestions.option;
                            } else {
                                issueSuggestions = [docIssue.suggestions.option];
                            }
                        }

                        problems.push({
                            error: docIssue.string,
                            preContext: issueTXTPreContext,
                            startLine: numberOfLinesToMistake,
                            startChar: linesToMistake[numberOfLinesToMistake].length,
                            endLine: numberOfLinesToMistake,
                            endChar: linesToMistake[numberOfLinesToMistake].length + docIssue.string.length,
                            type: docIssue.description,
                            message: docIssue.description + " [" + docIssue.string + "] - suggest [" + issueSuggestions.join(", ") + "]",
                            suggestions: issueSuggestions
                        });
                    }
                }
            }
            cb(problems);
        }
    });
}

// an individual error that is discoverted this interface will be used for diagnostic results as well as quick actions (the suggestions)
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

// HELPER recursive function to find the nth occurance of a string in an array
function nth_occurrence(string, char, nth) {
    let first_index = string.indexOf(char);
    let length_up_to_first_index = first_index + 1;

    if (nth == 1) {
        return first_index;
    } else {
        let string_after_first_occurrence = string.slice(length_up_to_first_index);
        let next_occurrence = nth_occurrence(string_after_first_occurrence, char, nth - 1);

        if (next_occurrence === -1) {
            return -1;
        } else {
            return length_up_to_first_index + next_occurrence;
        }
    }
}