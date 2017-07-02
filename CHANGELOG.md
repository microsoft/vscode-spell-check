# CHANGELOG: Spell Check

### 1.0.0 
Added guidance to un-install extension based on instability of the underlying service with a suggestion to leverage another one of the options out there.

### 0.9.1 
Changed English URI for checking as previous one stoped working.  Replaced teacher module to speed up adoption of new URI.  Moved change history to [CHANGELOG](CHANGELOG.md).  Fix for error on empty document well when toggling - thx [DonJayamanne](https://github.com/DonJayamanne).

### 0.8.6
Added a status bar adornment to enable the checker to be turned on and off.  Note actual checking still requires the current file type to be in the config file.

### 0.8.5
Adopted a number of contributions from [@cpetrov](https://github.com/cpetrov) that improved settings file formatting, resolved some setting file errors and corrected the base plaintext setting THANKYOU!

### 0.8.4
Fixed a bug in reading user settings that caused them to be ignored and overwritter if you added a word to dictionary or changed language.  Added some additional meta data to the extension manifest for the marketplace.

### 0.8.1
Fixed a bug where if no `.vscode` directory existed then changing language, adding to dictionary etc. would fail.  Also added an info message when the new folder is created.

### 0.8.0
This is a big in terms of the UX - suggestions are now code actions so `Ctrl+.` or `Alt+.` both work well to trigger and suggestions are now much more in-line and keyboard friendly.  Additionally you can disable problem types in the configuration and the included settings have been tweeked a little.

### 0.7.0
Improved `README.md` covering off settings for the `spell.json` file better.  If no mapping for an error type is assigned in the config file `Hint` will be used vs `Information` as the default.  Reduced the number of service queries with a delay routine.  Auto activated the extension and checking on first install.

### 0.6.2
**Support for HTTPS** documents are now submitted over the wire for checking using HTTPS.  Increased visibility of web service use [After the Deadline] in the description.  Added badges to `README.md`.

### 0.5.1
**Performance improvement** for activation event.

### 0.5.0 
Added a new set of settings to **ignore chunks of text** that match provided regular expressions.

### 0.4.0 
Added **add to ignore list** in suggest box, added ability to **check additional file types** (`languageIDs`), bug fixes

### 0.3.0 
Added ability to **change language** that is checked (`en`, `de`, `fr`, ...)