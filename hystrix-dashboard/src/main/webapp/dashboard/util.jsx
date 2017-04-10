

function assertEqual(s, t) {
    if(s != t) {
        throw new Error("Assert Failed '" + s + " != " + t + "'");
    }
}

function addCommas(nStr){
    nStr += '';
    if(nStr.length <=3) {
        return nStr; //shortcut if we don't need commas
    }
    let x = nStr.split('.');
    let x1 = x[0];
    let x2 = x.length > 1 ? '.' + x[1] : '';
    let rgx = /(\d+)(\d{3})/;
    while (rgx.test(x1)) {
        x1 = x1.replace(rgx, '$1' + ',' + '$2');
    }
    return x1 + x2;
}

function getUrlVars() {
    var vars = [], hash;
    var hashes = window.location.href.slice(window.location.href.indexOf('?') + 1).split('&');
    for(var i = 0; i < hashes.length; i++) {
        hash = hashes[i].split('=');
        vars.push(hash[0]);
        vars[hash[0]] = hash[1];
    }
    return vars;
}

function roundNumber(num) {
    var dec=1;
    var result = Math.round(num*Math.pow(10,dec))/Math.pow(10,dec);
    var resultAsString = result.toString();
    if(resultAsString.indexOf('.') == -1) {
        resultAsString = resultAsString + '.0';
    }
    return resultAsString;
}

function getInstanceAverage(value, reportingHosts, decimal) {
    if (decimal) {
        return roundNumber(value/reportingHosts);
    } else {
        return Math.floor(value/reportingHosts);
    }
}

export {
    assertEqual,
    getUrlVars,
    getInstanceAverage,
    roundNumber,
    addCommas
};