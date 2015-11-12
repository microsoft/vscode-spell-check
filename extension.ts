// This has been updated to 0.10.0 and works

import {workspace, languages, Diagnostic, DiagnosticSeverity, Location, Range, Disposable, TextDocument, Position, QuickPickOptions, QuickPickItem, window, commands} from 'vscode';

let t = require('teacher');
import fs = require('fs');

// the settings supported
interface SpellMDSettings {
    ignoreWordsList: string[];
    mistakeTypeToStatus: {}[];
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

// GLOBALS ///////////////////
let settings: SpellMDSettings;
let problems: SPELLMDProblem[] = [];
  

// Activate the extension
export function activate(disposables: Disposable[]) {
    console.log("Spell and Grammar checker active...");
    
    // TODO [p2] Currently the only way to refresh is to reload window add a wacher
    settings = readSettings();

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
    let docToCheck = document.getText();

    // clear existing problems
    problems = [];
    
    // the spell checker ignores a lot of chars so removing them aids in problem matching
    docToCheck = docToCheck.replace(/[`\"!#$%&()*+,.\/:;<=>?@\[\]\\^_{|}]/g, " ");
    
    if (document.languageId === "markdown") {
        spellcheckDocument(docToCheck, (problems) => {
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
        ignoreWordsList: cfg.ignoreWordsList,
        mistakeTypeToStatus: cfg.mistakeTypeToStatus
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
// teacher does not return a line number and results are not in order - so a lot of the code is about 'guessing' a line number
function spellcheckDocument(content: string, cb: (report: SPELLMDProblem[]) => void): void {
    let problemMessage: string;
    let detectedErrors: any = {};

    t.check(content, function(err, docProblems) {
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
                        startPosInFile = nth_occurrence(content, problemWithPreContent, detectedErrors[problemWithPreContent] + 1);
                        if (problemPreContext.length > 0) startPosInFile += problemPreContext.length;
                    } else {
                        startPosInFile = content.indexOf(problemWithPreContent);
                        if (startPosInFile !== -1 && problemPreContext.length > 0) startPosInFile += problemPreContext.length;
                    }

                    // At times I've inserted a lot of spaces so the match will be missed...
                    // time for some fallback this can produce some false positives but very few
                    if (startPosInFile === -1) {
                        let regex = new RegExp(problemPreContext + "[ ]+" + problemTXT, "g");
                        let m = regex.exec(content);
                        
                        // did we find a match
                        if (m !== null) {
                            // TODO only worry about first match for now
                            let matchTXT = m[0];
                            startPosInFile = m.index;
                            
                            // ok adjust for any precontent and padding
                            if (problemPreContext !== "") {
                                let regex2 = new RegExp(problemPreContext + "[ ]+", "g");
                                let m2 = regex2.exec(matchTXT);
                                startPosInFile += m2[0].length;
                            }

                        }
                    } 

                    if (startPosInFile !== -1) {
                        let linesToMistake: String[] = content.substring(0, startPosInFile).split('\n');
                        let numberOfLinesToMistake: number = linesToMistake.length - 1;

                        // use a counter for where the same error is found multiple times allows same work to match in different locations
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