import * as _ from 'underscore';
import React from 'react';
import ReactDOM from 'react-dom';
import Rx from 'rx-dom';

import { assertEqual, getUrlVars, getInstanceAverage, roundNumber, addCommas } from './util';

const urlVars = getUrlVars();

let allSockets = [];

delete window.document.referrer;

const streams = urlVars.streams ? JSON.parse(decodeURIComponent(urlVars.streams)) :
              urlVars.stream ? [{
                  stream: decodeURIComponent(urlVars.stream),
                  delay: urlVars.delay,
                  name: decodeURIComponent(urlVars.title),
                  auth: urlVars.authorization,
                  id: urlVars.id,
                  service: urlVars.service,
                  org: urlVars.org
              }] : [];

let CommandTable = React.createClass({
    getInitialState: function() {
        let wssocket = Rx.DOM.fromWebSocket(
            window.location.origin.replace('http://', 'ws://') +
                window.location.pathname.replace(/monitor\/.*/, 'ws/stream/proxy'),
            null,
            Rx.Observer.create(() => {
                wssocket.onNext(JSON.stringify({
                    origin: this.props.origin,
                    delay: 1000
                }));
            }),
            Rx.Observer.create(() => {
                console.log('Closing socket');
            })
        );

        wssocket.subscribe(this.onMessage, (e) => { console.log(e); }, () => {});

        this.wssocket = wssocket;
        allSockets.push(wssocket);

        this.sortfn = (msg) => { return msg.errorPercentage; };
        this.desc = false;
        this.lastSortingKey = 'errorPercentage';

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
        let rows;

        if (!this.props.sortByErrorThenVolume && !this.lastSortingKey.startsWith('errorPercentage')) {
            rows = _.sortBy(this.rows, this.sortfn);
            if (!this.desc) {
                rows = rows.reverse();
            }
        } else {
            rows = _.clone(this.rows).sort((a, b) => {
                return (parseFloat(b.errorPercentage) - parseFloat(a.errorPercentage)) ||
                    (parseFloat(b.ratePerSecond) - parseFloat(a.ratePerSecond));
            });
        }
        if (this.props.showNum > 0) {
            rows = rows.slice(0, this.props.showNum);
        }
        this.setState({rows: rows});
        this.lastUpdateTime = now;
    },

    onMessage: function(e) {
        try {
            let msg = JSON.parse(e.data.slice(6));

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
        } catch(ex) {
            console.log(e.data);
            console.log(ex);
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
                        <span className={row.isCircuitBreakerOpen == false ?'green':'fail'}>
                            {row.propertyValue_circuitBreakerForceClosed ? "closed(force)" :
                                (row.propertyValue_circuitBreakerForceOpen ? "open(force)" :
                                    row.isCircuitBreakerOpen.toString().replace("true", "open").replace("false", "closed"))}
                        </span>
                    </td>

                    {!this.props.simpleview&&<td className="result">{row.threadPool}</td>}
                    {!this.props.simpleview&&<td className="result">{row.pool?addCommas(row.pool.ratePerSecond):0}</td>}
                    {!this.props.simpleview&&<td className="result">{row.pool?addCommas(row.pool.ratePerSecondPerHost):0}</td>}
                    {!this.props.simpleview&&<td className="result">{row.pool?row.pool.currentActiveCount:0}</td>}
                    {!this.props.simpleview&&<td className="result">{addCommas(row.pool?row.pool.rollingMaxActiveThreads:0)}</td>}
                    {!this.props.simpleview&&<td className="result">{row.pool?row.pool.currentQueueSize:0}</td>}
                    {!this.props.simpleview&&<td className="result">{row.pool?row.pool.currentPoolSize:0}</td>}
                    {!this.props.simpleview&&<td className="result">{addCommas(row.pool?row.pool.propertyValue_queueSizeRejectionThreshold:0)}</td>}
                </tr>
            );
        });
        let title = '[' + this.props.streamInfo.org + '] ' + this.props.streamInfo.service + ' (' + this.props.origin + ')';
        if (rows.length == 0) {
            rows = [0,1,2,3,4].map(c => {
                return (
                    <tr key={c.toString()}>
                        <td className="result">{c}</td>
                        <td className="result">Loading...</td>
                        {_.range(2,19).map(n => {return <td className="result" key={n.toString()}>-</td>;})}
                    </tr>
                );
            });
        }
        return (
            <div>
                {!this.props.simpleview&&<h2><small>{title}</small></h2>}
                <table className="build" style={{float:(this.props.simpleview?'left':'none'), minHeight:'130px'}}>
                    <colgroup className="col-result" span="1"></colgroup>
                    <colgroup className="col-result" span="1"></colgroup>
                    <colgroup className="col-result" span="1"></colgroup>
                    <colgroup className="col-result" span="3"></colgroup>
                    <colgroup className="col-result" span="6"></colgroup>
                    <colgroup className="col-result" span="6"></colgroup>
                    {!this.props.simpleview&&<colgroup className="col-result" span="1"></colgroup>}
                    <tbody>
                    <tr></tr>
                    <tr>
                        <th>&nbsp;</th>
                        <th colSpan="1">{this.props.simpleview?('['+this.props.streamInfo.org+'] '+this.props.streamInfo.service):'command'}</th>
                        <th>&nbsp;</th>
                        <th colSpan="3">&nbsp;</th>
                        <th colSpan="6">latency</th>
                        <th colSpan="6">counter</th>
                        <th colSpan="1">&nbsp;</th>
                        {!this.props.simpleview&&<th colSpan="8">pool</th>}
                    </tr>
                    <tr>
                        <th className="result arch">&nbsp;</th>
                        <th onClick={this.handleSorting('name')} className="result arch">name</th>
                        <th data-balloon="Reporting Hosts" className="result arch">h</th>
                        <th onClick={this.handleSorting('ratePerSecond')}
                            data-balloon="Total Request Rate per Second for Cluster" className="result arch">qps(c)
                        </th>
                        <th onClick={this.handleSorting('ratePerSecond')}
                            data-balloon="Total Request Rate per Second per Reporting Host" className="result arch">
                            qps
                        </th>
                        <th onClick={this.handleSorting('errorPercentage')}
                            data-balloon="Error Percentage [Timed-out + Threadpool Rejected + Failure / Total]"
                            className="result arch">err
                        </th>
                        <th onClick={this.handleSorting('latencyExecute_mean')} data-balloon="Mean"
                            className="result arch">m
                        </th>
                        <th onClick={this.handleSorting('latencyExecute','50')} className="result arch">50</th>
                        <th onClick={this.handleSorting('latencyExecute','90')} className="result arch">90</th>
                        <th onClick={this.handleSorting('latencyExecute','95')} className="result arch">95</th>
                        <th onClick={this.handleSorting('latencyExecute','99')} className="result arch">99</th>
                        <th onClick={this.handleSorting('latencyExecute','99.5')} className="result arch">99.5</th>
                        <th onClick={this.handleSorting('rollingCountSuccess')}
                            data-balloon="Successful Request Count" className="result arch">succ
                        </th>
                        <th onClick={this.handleSorting('rollingCountShortCircuited')}
                            data-balloon="Short-circuited Request Count" className="result arch">sc
                        </th>
                        <th onClick={this.handleSorting('rollingCountBadRequests')} data-balloon="Bad Request Count"
                            className="result arch">bad
                        </th>
                        <th onClick={this.handleSorting('rollingCountTimeout')}
                            data-balloon="Timed-out Request Count" className="result arch">to
                        </th>
                        <th onClick={this.handleSorting('rollingCountThreadPoolRejected')}
                            data-balloon="Rejected Request Count" className="result arch">rej
                        </th>
                        <th onClick={this.handleSorting('rollingCountFailure')} data-balloon="Failure Request Count"
                            className="result arch">fa
                        </th>
                        <th onClick={this.handleSorting('isCircuitBreakerOpen')} data-balloon="Circuit Status"
                            className="result arch">circuit
                        </th>

                        {!this.props.simpleview&&<th onClick={this.handleSorting('threadPool')}
                                                     data-balloon="Thread Pool" className="result arch">pool</th>}
                        {!this.props.simpleview&&<th onClick={this.handleSorting('pool','ratePerSecond')}
                                                     data-balloon="Total Execution Rate per Second for Cluster"
                                                     className="result arch">qps(c)</th>}
                        {!this.props.simpleview&&<th onClick={this.handleSorting('pool','ratePerSecondPerHost')}
                                                     data-balloon="Total Execution Rate per Second per Reporting Host"
                                                     className="result arch">qps</th>}
                        {!this.props.simpleview&&<th onClick={this.handleSorting('pool','currentActiveCount')}
                                                     data-balloon="Active" className="result arch">act</th>}
                        {!this.props.simpleview&&<th onClick={this.handleSorting('pool','rollingMaxActiveThreads')}
                                                     data-balloon="Max Active" className="result arch">mact</th>}
                        {!this.props.simpleview&&<th onClick={this.handleSorting('pool','currentQueueSize')}
                                                     data-balloon="Queued - CurrentQueueSize"
                                                     className="result arch">qd</th>}
                        {!this.props.simpleview&&<th onClick={this.handleSorting('pool','currentPoolSize')}
                                                     data-balloon="Pool Size" className="result arch">ps</th>}
                        {!this.props.simpleview&&<th
                            onClick={this.handleSorting('pool','propertyValue_queueSizeRejectionThreshold')}
                            data-balloon="Queue Size - QueueSizeRejectionThreshold" className="result arch">qs</th>}
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
            delay: 1000
        };
        return {rows: [], params: this.defParams};
    },

    refetch: function() {
        fetch('../streams?action=read').then((raw) => {
            return raw.json();
        }).then((resp) => {
            if (resp.code == 0) {
                resp.data.map((row) => {
                    let checked = false;
                    for (var i = 0; i < streams.length; i++) {
                        if (streams[i].id == row.id) {
                            checked = true;
                        }
                    }
                    row.checked = checked;
                });

                this.setState({
                    rows: _.sortBy(resp.data, 'org'),
                    params: this.state.params
                });
            }
        });
    },

    onAdd: function() {
        let params = this.state.params;
        let args = '&org=' + encodeURIComponent(params.org.trim()) +
            '&service=' + encodeURIComponent(params.service.trim()) +
            '&stream=' + encodeURIComponent(params.stream.trim()) +
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

    onStreamCheckbox: function(e) {
        const target = e.target;
        const checked = target.checked;
        const id = target.name;

        let rows = this.state.rows;
        for (var i = 0; i < rows.length; i++) {
            if (rows[i].id == id) {
                rows[i].checked = checked;
            }
        }
        this.setState({rows: rows});

        allSockets.map(s => s.onCompleted());

        let args = JSON.stringify(
            rows.filter(row => { return row.checked; } ).map(r => { return { id: r.id}; })
        );
        location = '../monitor/table.jsp?streams='+encodeURIComponent(args);
    },

    render: function() {
        let args = [];
        let rows = this.state.rows.map((row) => {
            let argShow = {
                id: row.id
            };
            args.push(argShow);
            let argShowJson = JSON.stringify([argShow]);

            let argGraph = {
                id: row.id,
                auth: '',
                delay: row.delay,
                name: row.service,
                stream: row.stream
            };
            let argGraphJson = JSON.stringify([argGraph]);
            return (
                <tr key={row.id.toString()}>
                    <td className="result">{this.props.standalone ? row.id : <input type="checkbox" name={row.id} onChange={this.onStreamCheckbox} checked={row.checked}/>}</td>
                    <td className="result">{row.org}</td>
                    <td className="result service">{row.service}</td>
                    <td className="result stream">{row.stream}</td>
                    <td className="result">{row.delay}</td>
                    {this.props.standalone && <td className="result"><input name={row.id} type="submit" value="del" onClick={this.onDelete}/></td>}
                    <td className="result">
                        <a href={'../monitor/table.jsp?streams='+encodeURIComponent(argShowJson)}>show</a>&nbsp;
                        <a href={'../monitor/monitor.html?streams='+encodeURIComponent(argGraphJson)}>graph</a>
                    </td>
                </tr>
            );
        });
        return (
            <div>
                {this.props.standalone &&
                <nav className="dashboards">
                    <a href="../monitor/table.jsp">Dashboard</a>
                    <a href="http://t.meituan.com" target="_blank">ShortUrl</a>
                </nav>}
                <center>
                    <table className="build streams" style={{width: '98%'}}>
                        <thead>
                        <tr>
                            <th className="result">&nbsp;</th>
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
                            <th className="result"><a href={'../monitor/table.jsp?streams='+encodeURIComponent(JSON.stringify(args))}>show all</a></th>
                        </tr>}
                        {rows}
                        </tbody>
                    </table>
                </center>
            </div>
        );
    }
});

let TableView = React.createClass({
    getInitialState: function () {
        return {simpleview: true, showNum: 5, sortByErrorThenVolume: false};
    },

    onShowNumChange: function(e) {
        let showNum = parseInt(e.target.value);
        this.setState({showNum: showNum});
    },

    onCheckSimpleView: function(e) {
        this.setState({simpleview: e.target.checked});
    },

    onCheckSortByErrorThenVolume: function(e) {
        this.setState({sortByErrorThenVolume: e.target.checked});
    },

    render: function() {
        let tables = streams.map((s, i) => {
            let origin;
            let streamInfos = this.props.streamInfos;
            if (s != undefined) {
                origin = s.stream;

                if (!origin) {
                    for (var i = 0; i < streamInfos.length; i++) {
                        if (streamInfos[i].id == s.id) {
                            console.log('set origin = ' + streamInfos[i].stream);
                            origin = streamInfos[i].stream;
                            s = streamInfos[i];
                        }
                    }
                }

                if (origin.startsWith('http://')) {
                    origin = origin.slice(7, -1);
                }
                if (!origin.includes('.sankuai.com')) {
                    let idc = origin.slice(0, 2);
                    if (_.isNaN(parseInt(idc))) {
                        origin = origin.replace(':', '.' + idc + '.sankuai.com:');
                        s.stream = origin;
                    }
                }

                if (s.delay) {
                    origin = origin + "&delay=" + s.delay;
                }
            }
            return <CommandTable key={origin}
                                 origin={origin}
                                 streamInfo={s}
                                 simpleview={this.state.simpleview}
                                 sortByErrorThenVolume={this.state.sortByErrorThenVolume}
                                 showNum={this.state.showNum} />;
        });
        return <div>
            <nav className="dashboards">
                <a href="../monitor/streams.jsp">Streams</a>
                <label>
                    <select value={this.state.showNum} onChange={this.onShowNumChange}>
                        <option value="5">top 5</option>
                        <option value="10">top 10</option>
                        <option value="15">top 15</option>
                        <option value="20">top 20</option>
                        <option value="-1">all</option>
                    </select>
                </label>
                <label>
                    <input type="checkbox" onChange={this.onCheckSimpleView} checked={this.state.simpleview}/>
                    Simple View
                </label>
                <label>
                    <input type="checkbox" onChange={this.onCheckSortByErrorThenVolume} checked={this.state.sortByErrorThenVolume}/>
                    Sort: Error then Volume
                </label>
            </nav>
            <StreamsTable standalone={false} />
            <div id="dashboard-container" style={{minWidth:'1800px'}}>
            {tables}
            </div>
        </div>;
    }
});

if (document.getElementById("table_page") != null) {
    fetch('../streams?action=read').then((raw) => {
        return raw.json();
    }).then((resp) => {
        if (resp.code == 0) {
            console.log(resp.data);
            ReactDOM.render(
                <TableView streamInfos={resp.data}/>,
                document.getElementById('table_page')
            );
        }
    });
}

if (document.getElementById("streams_page") != null) {
    ReactDOM.render(
        <StreamsTable standalone={true} />,
        document.getElementById('streams_page')
    );
}
