import * as _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import ReactTable from 'react-table';

import { assertEqual, getUrlVars, getInstanceAverage, roundNumber, addCommas } from './util';

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
        let source = new EventSource(proxyStream);
        this.source = source;
        this.source.addEventListener('message', this.onMessage, false);

        this.rows = [];
        this.commands = {};
        this.commandsByPool = {};
        this.lastUpdateTime = Date.now();
        return {rows: []};
    },

    componentWillUnmount: function() {
        this.source.close();
    },

    convertAvg: function(msg, key, decimal) {
        if (decimal) {
            msg[key] = getInstanceAverage(msg[key], msg["reportingHosts"], decimal);
        } else {
            msg[key] = getInstanceAverage(msg[key], msg["reportingHosts"], decimal);
        }
    },

    // command helpers
    convertCommandAllAvg: function(msg) {
        this.convertAvg(msg, "errorPercentage", true);
        this.convertAvg(msg, "latencyExecute_mean", false);
    },

    calcCommandRatePerSecond: function(msg) {
        var numberSeconds = msg["propertyValue_metricsRollingStatisticalWindowInMilliseconds"] / 1000;

        var totalRequests = msg["requestCount"];
        if (totalRequests < 0) {
            totalRequests = 0;
        }
        msg["ratePerSecond"] =  roundNumber(totalRequests / numberSeconds);
        msg["ratePerSecondPerHost"] =  roundNumber(totalRequests / numberSeconds / msg["reportingHosts"]) ;
    },

    // pool helpers
    converPoolAllAvg: function(msg) {
        this.convertAvg(msg, "propertyValue_queueSizeRejectionThreshold", false);
        this.convertAvg(msg, "propertyValue_metricsRollingStatisticalWindowInMilliseconds", false);
    },

    calcPoolRatePerSecond: function(msg) {
        var numberSeconds = msg["propertyValue_metricsRollingStatisticalWindowInMilliseconds"] / 1000;

        var totalThreadsExecuted = msg["rollingCountThreadsExecuted"];
        if (totalThreadsExecuted < 0) {
            totalThreadsExecuted = 0;
        }
        msg["ratePerSecond"] =  roundNumber(totalThreadsExecuted / numberSeconds);
        msg["ratePerSecondPerHost"] =  roundNumber(totalThreadsExecuted / numberSeconds / msg["reportingHosts"]);
    },

    onMessage: function(e) {
        var msg = JSON.parse(e.data);

        if (msg && msg.type == 'HystrixCommand') {
            this.convertCommandAllAvg(msg);
            this.calcCommandRatePerSecond(msg);

            if (!_.has(this.commands, msg.name)) {
                let pos = this.rows.length;
                this.rows.push(msg);
                this.commands[msg.name] = {msg: msg, pos: pos};
                this.commandsByPool[msg.threadPool] = {msg: msg, pos: pos};
            }

            let cmd = this.commands[msg.name];
            msg.pool = this.rows[cmd.pos].pool;

            this.rows[cmd.pos] = msg;
            this.commands[msg.name].msg = msg;
            this.commandsByPool[msg.threadPool].msg = msg;
        } else if (msg && msg.type == 'HystrixThreadPool'){
            this.converPoolAllAvg(msg);
            this.calcPoolRatePerSecond(msg);

            let poolMsg = msg;
            let cmd = this.commandsByPool[poolMsg.name];

            if (cmd) {
                cmd.msg.pool = poolMsg;
                assertEqual(poolMsg.name, cmd.msg.threadPool);
                console.log("POOL:" + cmd.msg.pool.name + "," + cmd.msg.threadPool);
            }
        }

        let now = Date.now();
        if (now - this.lastUpdateTime > 500) {
            this.setState({rows: this.rows});
            this.lastUpdateTime = now;
        }
    },

    render: function() {
        let rows = this.state.rows.map((row, i) => {
            let hosts = row.reportingHosts;
            return (
                <tr key={row.name} className="commit">
                    <td className="result">{i}</td>
                    <td className="result">{row.name}</td>
                    <td className="result">{row.reportingHosts}</td>
                    <td className="result">{row.ratePerSecond}</td>
                    <td className="result">{getInstanceAverage(row.ratePerSecond,hosts,true)}</td>
                    <td className="result"><span className={row.errorPercentage>0?'fail':'ok'}>{row.errorPercentage}%</span></td>
                    <td className="result">{row.latencyExecute_mean}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['50'], hosts, false)}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['90'], hosts, false)}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['95'], hosts, false)}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['99'], hosts, false)}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['99.5'], hosts, false)}</td>
                    <td className="result"><span className="green">{addCommas(row.rollingCountSuccess)}</span></td>
                    <td className="result"><span className="blue">{addCommas(row.rollingCountShortCircuited)}</span></td>
                    <td className="result"><span className="lightSeaGreen">{addCommas(row.rollingCountBadRequests)}</span></td>
                    <td className="result">
                        <span className={row.rollingCountTimeout>0?"underline gold":"gold"}>{addCommas(row.rollingCountTimeout)}</span>
                    </td>
                    <td className="result">
                        <span className={row.rollingCountThreadPoolRejected>0?"underline purple":"purple"}>
                            {addCommas(row.rollingCountThreadPoolRejected)}
                        </span>
                    </td>
                    <td className="result">
                        <span className={row.rollingCountFailure>0?"underline red":"red"}>
                            {addCommas(row.rollingCountFailure)}
                        </span>
                    </td>
                    <td className="result">
                        <span className={row.isCircuitBreakerOpen?'fail':'ok'}>
                            {row.isCircuitBreakerOpen?'open':'closed'}
                        </span>
                    </td>

                    <td className="result">{row.threadPool}</td>
                    <td className="result">{row.pool?addCommas(row.pool.ratePerSecond):0}</td>
                    <td className="result">{row.pool?addCommas(row.pool.ratePerSecondPerHost):0}</td>
                    <td className="result">{row.pool?row.pool.currentActiveCount:0}</td>
                    <td className="result">{addCommas(row.pool?row.pool.rollingMaxActiveThreads:0)}</td>
                    <td className="result">{row.pool?row.pool.currentQueueSize:0}</td>
                    <td className="result">{addCommas(row.pool?row.pool.rollingCountThreadsExecuted:0)}</td>
                    <td className="result">{row.pool?row.pool.currentPoolSize:0}</td>
                    <td className="result">{addCommas(row.pool?row.pool.propertyValue_queueSizeRejectionThreshold:0)}</td>
                </tr>
            );
        });

        return (
            <div>
                <h2><small>{this.props.origin}</small></h2>
                <table className="build">
                    <colgroup className="col-result" span="1"></colgroup>
                    <colgroup className="col-result" span="1"></colgroup>
                    <colgroup className="col-result" span="1"></colgroup>
                    <colgroup className="col-result" span="3"></colgroup>
                    <colgroup className="col-result" span="6"></colgroup>
                    <colgroup className="col-result" span="6"></colgroup>
                    <colgroup className="col-result" span="1"></colgroup>
                    <tbody>
                    <tr></tr>
                    <tr>
                        <th>&nbsp;</th>
                        <th colSpan="1">command</th>
                        <th>&nbsp;</th>
                        <th colSpan="3">&nbsp;</th>
                        <th colSpan="6">latency</th>
                        <th colSpan="6">counter</th>
                        <th>&nbsp;</th>
                        <th colSpan="9">pool</th>
                    </tr>
                    <tr>
                        <th className="result arch">&nbsp;</th>
                        <th className="result arch">name</th>
                        <th className="result arch">h</th>
                        <th className="result arch">qps(c)</th>
                        <th className="result arch">qps</th>
                        <th className="result arch">err</th>
                        <th className="result arch">m</th>
                        <th className="result arch">50</th>
                        <th className="result arch">90</th>
                        <th className="result arch">95</th>
                        <th className="result arch">99</th>
                        <th className="result arch">99.5</th>
                        <th className="result arch">suc</th>
                        <th className="result arch">sc</th>
                        <th className="result arch">bad</th>
                        <th className="result arch">to</th>
                        <th className="result arch">rej</th>
                        <th className="result arch">fb</th>
                        <th className="result arch">cb</th>

                        <th className="result arch">pool</th>
                        <th className="result arch">qps(c)</th>
                        <th className="result arch">qps</th>
                        <th className="result arch">act</th>
                        <th className="result arch">mact</th>
                        <th className="result arch">qd</th>
                        <th className="result arch">exe</th>
                        <th className="result arch">ps</th>
                        <th className="result arch">qs</th>
                    </tr>
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
    return <CommandTable key={origin} origin={origin}/>;
});

ReactDOM.render(
    <div>{tables}</div>,
    document.getElementById('page')
);

