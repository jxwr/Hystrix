import * as _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTable from 'react-table';

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
};

function getInstanceAverage(value, reportingHosts, decimal) {
    if (decimal) {
        return roundNumber(value/reportingHosts);
    } else {
        return Math.floor(value/reportingHosts);
    }
}

const urlVars = getUrlVars();

const streams = urlVars.streams ? JSON.parse(decodeURIComponent(urlVars.streams)) :
              urlVars.stream ? [{
                  stream: decodeURIComponent(urlVars.stream),
                  delay: urlVars.delay,
                  name: decodeURIComponent(urlVars.title),
                  auth: urlVars.authorization
              }] : [];

let CommandTable = React.createClass({
    getInitialState: function() {
        var proxyStream = "../proxy.stream?origin=" + this.props.origin;
        this.source = new EventSource(proxyStream);
        this.source.addEventListener('message', this.onMessage, false);

        this.rows = [];
        this.commands = {};
        this.lastUpdateTime = Date.now();
        return {rows: []};
    },

    calcRatePerSecond: function(msg) {
        var numberSeconds = msg["propertyValue_metricsRollingStatisticalWindowInMilliseconds"] / 1000;

        var totalRequests = msg["requestCount"];
        if (totalRequests < 0) {
            totalRequests = 0;
        }
        msg["ratePerSecond"] =  roundNumber(totalRequests / numberSeconds);
        msg["ratePerSecondPerHost"] =  roundNumber(totalRequests / numberSeconds / msg["reportingHosts"]) ;
    },

    convertAvg: function(msg, key, decimal) {
        if (decimal) {
            msg[key] = getInstanceAverage(msg[key], msg["reportingHosts"], decimal);
        } else {
            msg[key] = getInstanceAverage(msg[key], msg["reportingHosts"], decimal);
        }
    },

    convertAllAvg: function(msg) {
        this.convertAvg(msg, "errorPercentage", true);
        this.convertAvg(msg, "latencyExecute_mean", false);
    },

    onMessage: function(e) {
        var msg = JSON.parse(e.data);
        if (msg && msg.type == 'HystrixCommand') {
            this.convertAllAvg(msg);
            this.calcRatePerSecond(msg);

            if (!_.has(this.commands, msg.name)) {
                var pos = this.rows.length;
                this.rows.push(msg);
                this.commands[msg.name] = {msg: msg, pos: pos};
            }
            var cmd = this.commands[msg.name];
            this.rows[cmd.pos] = msg;
            var now = Date.now();
            if (now - this.lastUpdateTime > 1000) {
                this.setState({rows: this.rows});
                this.lastUpdateTime = now;
            }
        }
    },

    render: function() {
        let rows = this.state.rows.map((row, i) => {
            let hosts = row.reportingHosts;
            return (
                <tr key={row.name} className="commit">
                    <td>{i}</td>
                    <td>{row.name}</td>
                    <td>{row.threadPool}</td>
                    <td>{row.reportingHosts}</td>
                    <td>{row.ratePerSecond}</td>
                    <td>{getInstanceAverage(row.ratePerSecond,hosts,true)}</td>
                    <td><span className={row.errorPercentage>0?'fail':'ok'}>{row.errorPercentage}%</span></td>
                    <td>{getInstanceAverage(row.latencyExecute['50'], hosts, false)}</td>
                    <td>{getInstanceAverage(row.latencyExecute['90'], hosts, false)}</td>
                    <td>{getInstanceAverage(row.latencyExecute['95'], hosts, false)}</td>
                    <td>{getInstanceAverage(row.latencyExecute['99'], hosts, false)}</td>
                    <td>{getInstanceAverage(row.latencyExecute['99.5'], hosts, false)}</td>
                    <td>{row.latencyExecute_mean}</td>
                    <td>{addCommas(row.rollingCountSuccess)}</td>
                    <td>{addCommas(row.rollingCountShortCircuited)}</td>
                    <td>{addCommas(row.rollingCountBadRequests)}</td>
                    <td>{addCommas(row.rollingCountTimeout)}</td>
                    <td>{addCommas(row.rollingCountThreadPoolRejected)}</td>
                    <td>{addCommas(row.rollingCountFailure)}</td>
                    <td>{row.isCircuitBreakerOpen?'open':'closed'}</td>
                </tr>
            );
        });

        return (
            <div>
                <h2><small>{this.props.origin}</small></h2>
                <table className="build">
                    <colgroup className="col-result" span="1"></colgroup>
                    <colgroup className="col-result" span="2"></colgroup>
                    <colgroup className="col-result" span="1"></colgroup>
                    <colgroup className="col-result" span="3"></colgroup>
                    <colgroup className="col-result" span="6"></colgroup>
                    <colgroup className="col-result" span="6"></colgroup>
                    <tr></tr>
                    <tr>
                        <th>&nbsp;</th>
                        <th colSpan="2">command</th>
                        <th>&nbsp;</th>
                        <th colSpan="3">&nbsp;</th>
                        <th colSpan="6">latency</th>
                        <th colSpan="6">counter</th>
                        <th>circuit</th>
                    </tr>
                    <tr>
                        <th className="result arch">&nbsp;</th>
                        <th>name</th>
                        <th>pool</th>
                        <th>h</th>
                        <th>qps(c)</th>
                        <th>qps</th>
                        <th>err</th>
                        <th>50</th>
                        <th>90</th>
                        <th>95</th>
                        <th>99</th>
                        <th>99.5</th>
                        <th>m</th>
                        <th>suc</th>
                        <th>sc</th>
                        <th>bad</th>
                        <th>to</th>
                        <th>rej</th>
                        <th>fb</th>
                        <th>cb</th>
                    </tr>
                    {rows}
                </table>
            </div>
        );
    }
});

let tables = streams.map((s, i) => {
    let origin;
    if(s != undefined) {
        origin = s.stream;

        if(s.delay) {
            origin = origin + "&delay=" + s.delay;
        }
    }
    return <CommandTable key={origin} origin={origin}/>;
});

ReactDOM.render(
    <div>{tables}</div>,
    document.getElementById('page')
);

