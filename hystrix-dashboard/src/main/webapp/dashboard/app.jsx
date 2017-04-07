import * as _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTable from 'react-table';

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

let urlVars = getUrlVars();

let streams = urlVars.streams ? JSON.parse(decodeURIComponent(urlVars.streams)) :
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

        this._rows = [];
        this._commands = {};
        this._lastUpdateTime = Date.now();
        return {rows: []};
    },

    onMessage: function(e) {
        var msg = JSON.parse(e.data);
        if (msg && msg.type == 'HystrixCommand') {
            if (!_.has(this._commands, msg.name)) {
                var pos = this._rows.length;
                this._rows.push(msg);
                this._commands[msg.name] = {msg: msg, pos: pos};
            }
            var cmd = this._commands[msg.name];
            this._rows[cmd.pos] = msg;
            var now = Date.now();
            if (now - this._lastUpdateTime > 1000) {
                this.setState({rows: this._rows});
                this._lastUpdateTime = now;
            }
        }
    },

    render: function() {
        //console.log('rows:' + this.state.rows.length);
        var rows = this.state.rows.map((row, i) => {
            return (
                <tr key={row.name} className="commit">
                    <td>{i}</td>
                    <td>{row.name}</td>
                    <td>{row.threadPool}</td>
                    <td>{row.reportingHosts}</td>
                    <td>{row.requestCount}</td>
                    <td><span className={row.errorPercentage>0?'fail':'ok'}>{row.errorPercentage}%</span></td>
                    <td>{row.latencyExecute['50']}</td>
                    <td>{row.latencyExecute['90']}</td>
                    <td>{row.latencyExecute['95']}</td>
                    <td>{row.latencyExecute['99']}</td>
                    <td>{row.latencyExecute['99.5']}</td>
                    <td>{row.latencyExecute_mean}</td>
                    <td>{row.rollingCountSuccess}</td>
                    <td>{row.rollingCountShortCircuited}</td>
                    <td>{row.rollingCountBadRequests}</td>
                    <td>{row.rollingCountTimeout}</td>
                    <td>{row.rollingCountThreadPoolRejected}</td>
                    <td>{row.rollingCountFailure}</td>
                    <td>{row.isCircuitBreakerOpen?'open':'close'}</td>
                </tr>
            );
        });
        let origin = this.props.origin;
        return (
            <div key={origin}>
                <h2><small>{origin}</small></h2>
                <table className="build">
                    <thead>
                        <tr>
                            <th>&nbsp;</th>
                            <th>Name</th>
                            <th>Pool</th>
                            <th>H</th>
                            <th>R</th>
                            <th>E</th>
                            <th>50</th>
                            <th>90</th>
                            <th>95</th>
                            <th>99</th>
                            <th>99.5</th>
                            <th>m</th>
                            <th>S</th>
                            <th>C</th>
                            <th>B</th>
                            <th>T</th>
                            <th>R</th>
                            <th>F</th>
                            <th>O</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows}
                    </tbody>
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

    console.log("origin:" + origin);
    return <CommandTable origin={origin}/>;
});

ReactDOM.render(
    <div>{tables}</div>,
    document.getElementById('page')
);

