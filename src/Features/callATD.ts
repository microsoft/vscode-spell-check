'use strict';

let xml2js = require('xml2js');
let request = require('request');
let crypto = require('crypto');
let os = require('os');


function GetURI(language: String): String {
    switch (language) {
        case 'en': return 'https://www.polishmywriting.com/proxy.php?url=/checkDocument';
        case 'fr': return 'https://fr.service.afterthedeadline.com/checkDocument';
        case 'de': return 'https://de.service.afterthedeadline.com/checkDocument';
        case 'pt': return 'https://pt.service.afterthedeadline.com/checkDocument';
        case 'es': return 'https://es.service.afterthedeadline.com/checkDocument';
        default: return 'https://www.polishmywriting.com/proxy.php?url=/checkDocument';
    }
}


function PostToATD(content: String, language: String, fn) {
    let key = crypto.createHash('sha1').update(os.hostname()).digest('hex');
    let parser = new xml2js.Parser;

    request({ method: "POST", url: GetURI(language), form: { data: content, key: key } },
        function (error, response, body) {
            if (error) return fn(error, null);

            parser.parseString(body, function (error, result) {
                if (error) return fn(error);
                fn(null, result);
            })
        }
    );
}

export function check(language, content, fn) {

    let ignored = [
        'bias language', 'cliches', 'complex expression',
        'diacritical marks', 'double negatives', 'hidden verbs',
        'jargon language', 'passive voice', 'phrases to avoid',
        'redundant expression'
    ];

    PostToATD(content, language, function (error, data) {
        if (error || !data || !data.error) return fn(error, null);
        if (!Array.isArray(data.error)) data.error = [data.error];

        let problems = data.error.filter(function (obj) {
            return !(~ignored.indexOf(obj.type));
        });

        fn(null, problems);
    });
};
