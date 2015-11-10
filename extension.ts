// This has been updated to 0.10.0 and works

import {workspace, languages, Diagnostic, DiagnosticSeverity, Location, Range, Disposable, TextDocument, Position, QuickPickOptions, QuickPickItem, window, commands} from 'vscode';

let t = require('teacher');
import fs = require('fs');


let settings: SpellMDSettings;
let problems: SPELLMDProblem[] = [];
    

// Activate the extension
export function activate(disposables: Disposable[]) {
    console.log("Spell and Grammar checker active...");
    
    // load in the settings from an optional project specific setting file 
    // TODO [p2] Currently the only way to refresh is to reload window - as a worker I was watchin the file for updates which was cool
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

// Itterate through the errors and populate the diagnostics
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

// when on an error suggest fixes
// TODO: [p2] This should really use a quickfix/lighbulb and not a QuickPick
function suggestFix() {
    let opts: QuickPickOptions = { matchOnDescription: true, placeHolder: "Here's a suggestion or two for..." };
    let items: QuickPickItem[] = [];
    let e = window.activeTextEditor;
    let d = e.document;
    let sel = e.selection;
    
    // TODO [p1] need to actually use the error context i.e. diagnostic start and end in the current location
    // The issue is that some grammar errors will be multiple words
    let wordRange: Range = d.getWordRangeAtPosition(sel.active);
    let word: string = d.getText(wordRange);
        
    // find the key data for the specific issue
    // TODO the problem array can be empty here need to debug why only sporaticly so likely a race
    let problem: SPELLMDProblem = problems.filter(function(obj) {
        return obj.error === word;
    })[0];
            
    // provide suggestions
    for (let i = 0; i < problem.suggestions.length; i++) {
        items.push({ label: problem.suggestions[i], description: "Replace [" + word + "] with [" + problem.suggestions[i] + "]" });
    }

    // replace the text with the selection
    // TODO [p2] provide an add option that would write the error into the spell.json disctonary
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
function readSettings(): SpellMDSettings {
    let CONFIGFILE = workspace.rootPath + "/.vscode/spell.json";
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

// Take in a text doc and produce the set of problems for both the editor action and actions
// teacher does not return a line number and results are not in order - so a lot of the code is about 'guessing' a line number
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

                    // The spell checker is pretty agressive on removing some separators which can impact matching
                    if(startPosInFile === -1){
                        let separators: RegExp = /["`.]/g;
                        
                        // remove the separators and try to match it again
                        startPosInFile = content.replace(separators, "").indexOf(issueTXTSearch);
            
                        // If we found it work out how many separators we removed
                        // TODO Improve this logic for where we slice/count how many were skipped
                        let removedPadding = content.slice(0,startPosInFile).match(separators);
                        if(removedPadding!==null) {
                            startPosInFile += removedPadding.length + 1;
                        }
                        //console.log(issueTXTSearch + " .. " + removedPadding.length);
                    }
                    
                    // If there was a precontext remove it fron the position calculations from position calculation
                    if (issueTXTPreContext.length > 0) {
                        startPosInFile += issueTXTPreContext.length;
                    }

                    if (startPosInFile !== -1) {
                        let linesToMistake: String[] = content.substring(0, startPosInFile).split('\n');
                        let numberOfLinesToMistake: number = linesToMistake.length - 1;

                        // use a counter for where the same error is found multiple times this helps in 'guessing' the right line no.
                        if (!detectedErrors[issueTXTSearch]) {
                            detectedErrors[issueTXTSearch] = 0;
                            ++detectedErrors[issueTXTSearch];
                        } else {
                            ++detectedErrors[issueTXTSearch];
                        }

                        // make the suggestions an array even if only one is returned
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