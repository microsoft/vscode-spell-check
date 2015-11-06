# Functionality

Load up a Markdown file and get look highlights and hovers for existing issues.  Checking will occur as you type in the document.  And you can get suggested fixes by hitting `Alt+T`.

# Install

Open up VS Code and hit `F1` and type `ext` select install and type `spell` hit enter and reload window to enable. 

![install and work](images/spell-install.gif)



# Get a Suggestion

If an error is detected then hit `Alt+T` to get a suggest lis and elect the suggestion to replace the error.


# Configuration
A [sample file](https://github.com/Microsoft/vscode-spell-check/blob/master/.vscode/spell.json) is included in this repo.

The plug-in supports a config file.  This should go in the `.vscode` directory and needs to be called `spell.json`.  This file has the following sections:
* **version** incase I change the format
* **ignoreWordsList** an array of strings that represents words not to check
* **mistakeTypeToStatus** we detect many error types and this is how they map to VS Code severities
* **replaceRegExp** this is an array of RegExps represented as strings for pre-parsing the doc e.g. removing code blocks 

> **Tip:** you need to convert any `\` from the RegExp to a `\\\\` sequence for the JSON to parse.



For now if you update the config file you need to reload the window for changes to take effect e.g. `F1` and type `reload` then hit enter.



# Backlog/Known Issues

Here are some ideas and known issues - fell free to add more.

1. Watch for config file changes to avoid the reload
2. On folder open check every file in the background
	1. Have an `excludeFilesList` in the options
3. Provide an action to add a word to the dictionary 
	1. When adding a word also add plurals/sentence case etc
4. ISSUE: Positions sometime don't work 100% 
5. ISSUE: Suggest does not work on multiple word issues