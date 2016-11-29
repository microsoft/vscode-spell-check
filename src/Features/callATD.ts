'use strict';

let xml2js = require('xml2js');
let request = require('request');
let crypto = require('crypto');
let os = require('os');


function PostToATD(content: String, languageURI: String, fn) {
    let key = crypto.createHash('sha1').update(os.hostname()).digest('hex');
    let parser = new xml2js.Parser;

    request({ method: "POST", url: languageURI, form: { data: content, key: key } },
        function (error, response, body) {
            if (error) return fn(error, null);

            parser.parseString(body, function (error, result) {
                if (error) return fn(error);
                fn(null, result);
            })
        }
    );
}

export function check(languageURI, content, fn) {

    let ignored = [
        'bias language', 'cliches', 'complex expression',
        'diacritical marks', 'double negatives', 'hidden verbs',
        'jargon language', 'passive voice', 'phrases to avoid',
        'redundant expression'
    ];

    PostToATD(content, languageURI, function (error, data) {
        if (error || !data || !data.error) return fn(error, null);
        if (!Array.isArray(data.error)) data.error = [data.error];

        let problems = data.error.filter(function (obj) {
            return !(~ignored.indexOf(obj.type));
        });

        fn(null, problems);
    });
};
