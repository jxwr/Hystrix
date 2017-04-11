import * as _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';

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
        let proxyStream = "../proxy.stream?origin=" + this.props.origin;
        this.source = new EventSource(proxyStream);
        this.source.addEventListener('message', this.onMessage, false);

        this.sortfn = (msg) => { return msg.name; };
        this.desc = false;
        this.lastSortingKey = '';

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

        // take care of turbine bug
        if (msg.propertyValue_metricsRollingStatisticalWindowInMilliseconds/msg.reportingHosts % 1000 == 0) {
            this.convertAvg(msg, "propertyValue_metricsRollingStatisticalWindowInMilliseconds", false);
        }
    },

    calcCommandRatePerSecond: function(msg) {
        let numberSeconds = msg["propertyValue_metricsRollingStatisticalWindowInMilliseconds"] / 1000;

        let totalRequests = msg["requestCount"];
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
        let numberSeconds = msg["propertyValue_metricsRollingStatisticalWindowInMilliseconds"] / 1000;

        let totalThreadsExecuted = msg["rollingCountThreadsExecuted"];
        if (totalThreadsExecuted < 0) {
            totalThreadsExecuted = 0;
        }
        msg["ratePerSecond"] =  roundNumber(totalThreadsExecuted / numberSeconds);
        msg["ratePerSecondPerHost"] =  roundNumber(totalThreadsExecuted / numberSeconds / msg["reportingHosts"]);
    },

    updateRows: function() {
        let now = Date.now();
        let rows = _.sortBy(this.rows, this.sortfn);
        if (!this.desc) {
            rows = rows.reverse();
        }
        this.setState({rows: rows});
        this.lastUpdateTime = now;
    },

    onMessage: function(e) {
        let msg = JSON.parse(e.data);

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
                assertEqual(poolMsg.name, cmd.msg.threadPool);
                cmd.msg.pool = poolMsg;
            }
        }

        if (Date.now() - this.lastUpdateTime > 200) {
            this.updateRows();
        }
    },

    handleSorting: function(key0, key1) {
        return (e) => {
            if (key0 + '_' + key1 == this.lastSortingKey) {
                this.desc = !this.desc;
                this.updateRows();
                return;
            }

            this.desc = false;
            this.lastSortingKey = key0 + '_' + key1;
            this.sortfn = (v) => {
                let field = v[key0];
                if (field == undefined) {
                    return -1;
                }
                if (key1 && field) {
                    field = field[key1];
                }
                if (field == undefined) {
                    return -1;
                }
                let n = (parseFloat(field)*100)/v.reportingHosts;
                return Number.isNaN(n) ? field : n;
            };
            this.updateRows();
        };
    },

    render: function() {
        let rows = this.state.rows.map((row, i) => {
            let hosts = row.reportingHosts;
            return (
                <tr key={row.name} className="commit">
                    <td className="result">{i}</td>
                    <td className="result">{row.name}</td>
                    <td className="result">{row.reportingHosts}</td>
                    <td className="result">{addCommas(row.ratePerSecond)}</td>
                    <td className="result">{getInstanceAverage(row.ratePerSecond,hosts,true)}</td>
                    <td className="result"><span className={row.errorPercentage>0?'fail':'ok'}>{row.errorPercentage}%</span></td>
                    <td className="result">{row.latencyExecute_mean}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['50'], hosts, false)}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['90'], hosts, false)}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['95'], hosts, false)}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['99'], hosts, false)}</td>
                    <td className="result">{getInstanceAverage(row.latencyExecute['99.5'], hosts, false)}</td>
                    <td className="result"><span className="green">{addCommas(row.rollingCountSuccess)}</span></td>
                    <td className="result">
                        <span className={row.rollingCountShortCircuited>0?"fail":"blue"}>
                            {addCommas(row.rollingCountShortCircuited)}
                        </span>
                    </td>
                    <td className="result">
                        <span className={row.rollingCountBadRequests>0?"fail":"lightSeaGreen"}>
                            {addCommas(row.rollingCountBadRequests)}
                        </span>
                    </td>
                    <td className="result">
                        <span className={row.rollingCountTimeout>0?"fail":"gold"}>{addCommas(row.rollingCountTimeout)}</span>
                    </td>
                    <td className="result">
                        <span className={row.rollingCountThreadPoolRejected>0?"fail":"purple"}>
                            {addCommas(row.rollingCountThreadPoolRejected)}
                        </span>
                    </td>
                    <td className="result">
                        <span className={row.rollingCountFailure>0?"fail":"red"}>
                            {addCommas(row.rollingCountFailure)}
                        </span>
                    </td>
                    <td className="result">
                        <span className={row.isCircuitBreakerOpen?'fail':'green'}>
                            {row.isCircuitBreakerOpen?'open':'closed'}
                        </span>
                    </td>

                    <td className="result">{row.threadPool}</td>
                    <td className="result">{row.pool?addCommas(row.pool.ratePerSecond):0}</td>
                    <td className="result">{row.pool?addCommas(row.pool.ratePerSecondPerHost):0}</td>
                    <td className="result">{row.pool?row.pool.currentActiveCount:0}</td>
                    <td className="result">{addCommas(row.pool?row.pool.rollingMaxActiveThreads:0)}</td>
                    <td className="result">{row.pool?row.pool.currentQueueSize:0}</td>
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
                        <th onClick={this.handleSorting('name')} className="result arch">name</th>
                        <th data-balloon="Reporting Hosts" className="result arch">h</th>
                        <th onClick={this.handleSorting('ratePerSecond')} data-balloon="Total Request Rate per Second for Cluster" className="result arch">qps(c)</th>
                        <th onClick={this.handleSorting('ratePerSecond')} data-balloon="Total Request Rate per Second per Reporting Host" className="result arch">qps</th>
                        <th onClick={this.handleSorting('errorPercentage')} data-balloon="Error Percentage [Timed-out + Threadpool Rejected + Failure / Total]" className="result arch">err</th>
                        <th onClick={this.handleSorting('latencyExecute_mean')} data-balloon="Mean" className="result arch">m</th>
                        <th onClick={this.handleSorting('latencyExecute','50')} className="result arch">50</th>
                        <th onClick={this.handleSorting('latencyExecute','90')} className="result arch">90</th>
                        <th onClick={this.handleSorting('latencyExecute','95')} className="result arch">95</th>
                        <th onClick={this.handleSorting('latencyExecute','99')} className="result arch">99</th>
                        <th onClick={this.handleSorting('latencyExecute','99.5')} className="result arch">99.5</th>
                        <th onClick={this.handleSorting('rollingCountSuccess')} data-balloon="Successful Request Count" className="result arch">succ</th>
                        <th onClick={this.handleSorting('rollingCountShortCircuited')} data-balloon="Short-circuited Request Count" className="result arch">sc</th>
                        <th onClick={this.handleSorting('rollingCountBadRequests')} data-balloon="Bad Request Count" className="result arch">bad</th>
                        <th onClick={this.handleSorting('rollingCountTimeout')} data-balloon="Timed-out Request Count" className="result arch">to</th>
                        <th onClick={this.handleSorting('rollingCountThreadPoolRejected')} data-balloon="Rejected Request Count" className="result arch">rej</th>
                        <th onClick={this.handleSorting('rollingCountFailure')} data-balloon="Failure Request Count" className="result arch">fa</th>
                        <th onClick={this.handleSorting('isCircuitBreakerOpen')} data-balloon="Circuit Status" className="result arch">circuit</th>

                        <th onClick={this.handleSorting('threadPool')} data-balloon="Thread Pool" className="result arch">pool</th>
                        <th onClick={this.handleSorting('pool','ratePerSecond')} data-balloon="Total Execution Rate per Second for Cluster" className="result arch">qps(c)</th>
                        <th onClick={this.handleSorting('pool','ratePerSecondPerHost')} data-balloon="Total Execution Rate per Second per Reporting Host" className="result arch">qps</th>
                        <th onClick={this.handleSorting('pool','currentActiveCount')} data-balloon="Active" className="result arch">act</th>
                        <th onClick={this.handleSorting('pool','rollingMaxActiveThreads')} data-balloon="Max Active" className="result arch">mact</th>
                        <th onClick={this.handleSorting('pool','currentQueueSize')} data-balloon="Queued - CurrentQueueSize" className="result arch">qd</th>
                        <th onClick={this.handleSorting('pool','currentPoolSize')} data-balloon="Pool Size" className="result arch">ps</th>
                        <th onClick={this.handleSorting('pool','propertyValue_queueSizeRejectionThreshold')} data-balloon="Queue Size - QueueSizeRejectionThreshold" className="result arch">qs</th>
                    </tr>
                    {rows}
                    </tbody>
                </table>
            </div>
        );
    }
});

let StreamsTable = React.createClass({
    getInitialState: function() {
        this.refetch();
        this.defParams = {
            org: '',
            service: '',
            stream: '',
            delay: 100
        };
        return {rows: [], params: this.defParams};
    },

    refetch: function() {
        fetch('../streams?action=read').then((raw) => {
            return raw.json();
        }).then((resp) => {
            if (resp.code == 0) {
                this.setState({
                    rows: _.sortBy(resp.data, 'org'),
                    params: this.state.params
                });
            }
        });
    },

    onAdd: function() {
        let params = this.state.params;
        let args = '&org=' + encodeURIComponent(params.org) +
            '&service=' + encodeURIComponent(params.service) +
            '&stream=' + encodeURIComponent(params.stream) +
            '&delay=' + params.delay;

        fetch('../streams?action=create' + args).then((raw) => {
            return raw.json();
        }).then((resp) => {
            if (resp.code == 0) {
                this.refetch();
            } else {
                alert(resp.data);
            }
        });
    },

    onChange: function(e) {
        this.state.params[e.target.name] = e.target.value;
        this.setState({params: this.state.params});
    },

    onDelete: function(e) {
        let id = e.target.name;

        fetch('../streams?action=delete&id='+id).then((raw) => {
            return raw.json();
        }).then((resp) => {
            if (resp.code == 0) {
                this.refetch();
            } else {
                alert(resp.data);
            }
        });
    },

    render: function() {
        let rows = this.state.rows.map((row) => {
            let args = JSON.stringify([{
                auth: '',
                delay: row.delay,
                name: row.service,
                stream: row.stream
            }]);
            return (
                <tr key={row.id.toString()}>
                    <td className="result">{row.id}</td>
                    <td className="result">{row.org}</td>
                    <td className="result service">{row.service}</td>
                    <td className="result stream">{row.stream}</td>
                    <td className="result">{row.delay}</td>
                    {this.props.standalone && <td className="result"><input name={row.id} type="submit" value="del" onClick={this.onDelete}/></td>}
                    <td className="result">
                        <a href={'../monitor/table.jsp?streams='+encodeURIComponent(args)}>show</a>&nbsp;
                        <a href={'../monitor/monitor.html?streams='+encodeURIComponent(args)}>graph</a>
                    </td>
                </tr>
            );
        });
        return (
            <div>
                {this.props.standalone &&
                <nav className="dashboards">
                    <a href="../monitor/table.jsp">dashboard</a>
                </nav>}
                <center>
                    <table className="build streams" style={{width: '98%'}}>
                        <thead>
                        <tr>
                            <th className="result">id</th>
                            <th className="result">org</th>
                            <th className="result service">service</th>
                            <th className="result stream">stream(url)</th>
                            <th className="result">delay(ms)</th>
                            {this.props.standalone && <th className="result">action</th>}
                            <th className="result">link</th>
                        </tr>
                        </thead>
                        <tbody>
                        {this.props.standalone &&
                        <tr>
                            <th className="result"></th>
                            <th className="result"><input type="text" name="org" value={this.state.params.org} onChange={this.onChange}/></th>
                            <th className="result service"><input type="text" name="service" value={this.state.params.service} onChange={this.onChange}/></th>
                            <th className="result stream"><input className="stream" type="text" name="stream" value={this.state.params.stream} onChange={this.onChange}/></th>
                            <th className="result"><input type="text" name="delay" value={this.state.params.delay} onChange={this.onChange}/></th>
                            <th className="result"><input type="submit" value="add" onClick={this.onAdd}/></th>
                            <th className="result">&nbsp;</th>
                        </tr>}
                        {rows}
                        </tbody>
                    </table>
                </center>
            </div>
        );
    }
});

if (document.getElementById("table_page") != null) {
    let tables = streams.map((s, i) => {
        let origin;
        if (s != undefined) {
            origin = s.stream;

            if (s.delay) {
                origin = origin + "&delay=" + s.delay;
            }
        }
        return <CommandTable key={origin} origin={origin}/>;
    });

    ReactDOM.render(
        <div>
            <nav className="dashboards">
                <a href="../monitor/streams.jsp">Streams</a>
            </nav>
            <StreamsTable standalone={false}/>
            {tables}
        </div>,
        document.getElementById('table_page')
    );
}

if (document.getElementById("streams_page") != null) {
    ReactDOM.render(
        <StreamsTable standalone={true}/>,
        document.getElementById('streams_page')
    );
}
