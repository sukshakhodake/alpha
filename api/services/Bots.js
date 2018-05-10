var cron = require('node-cron');
var schema = new Schema({
    botId: String,
    accessToken: String,
    table: {
        type: Schema.Types.ObjectId,
        ref: 'Tables',
        index: true
    },
    gamePlay: {
        type: Schema.Types.ObjectId,
        ref: 'GamePlay',
        index: true
    },
    balance: Number,
    username: String,
    password: String,
    blindCount: Number,
    seenCount: Number,
    tableType: String,
    userData: Schema.Types.Mixed

});

schema.plugin(deepPopulate, {});
schema.plugin(uniqueValidator);
schema.plugin(timestamps);
module.exports = mongoose.model('Bots', schema);

var exports = _.cloneDeep(require("sails-wohlig-service")(schema));
var model = {

    /**
     *  initially save the usename and pasword in bots then get all data of pertucular username and store it.
     * 
     *  @param  {String} username -   input username.
     *  @param  {String} password -   input password
     * 
     *  @returns  {callback} callback -   Return user details of perticular user.
     */
    checkUser: function (data, callback) {
        var dataToUse = {};
        async.waterfall([
                //save Bots 
                function (callback) {
                    Bots.saveData(data, callback);
                },
                function (usedata, callback) {
                    dataToUse = usedata._id;
                    var userData = {};
                    userData.username = usedata.username;
                    userData.password = usedata.password;
                    request.post({
                        url: global["env"].mainServer + 'member/playerLogin',
                        body: userData,
                        json: true
                    }, function (error, response, body) {
                        if (error) {
                            console.log("error-------", error);
                            callback(error, null);
                        } else {
                            callback(null, body);
                        }
                    });
                },
                function (accessT, callback) {
                    var access = {};
                    access.accessToken = accessT.data;
                    request.post({
                        url: global["env"].mainServer + 'member/getAccessLevel',
                        body: access,
                        json: true
                    }, function (error, response, body) {
                        if (error) {
                            callback(error, null);
                        } else {
                            callback(null, body);
                            var botsData = {};
                            botsData._id = dataToUse;
                            botsData.userData = body.data;
                            botsData.balance = body.data.creditLimit;
                            botsData.botId = body.data._id;
                            botsData.accessToken = body.data.accessToken[0];
                            // Push userid in allBots 
                            var dataToPush = {};
                            dataToPush._id = dataToUse;
                            global.allBots.push(dataToPush);
                            Bots.saveData(botsData, function () {});
                        }
                    });
                }
            ],
            callback);
    },

    /**
     *  get all tables Data
     * 
     *  @param  {String} maxRow -   send number to fetch that much amount of data.     * 
     *  @returns  {callback} callback -   Return table Data.
     */
    getTableInfo: function (data, callback) {
        var dataToSend = {};
        var tableInfoToSend = {};
        dataToSend.maxRow = 100;
        dataToSend.filter = {
            type: "public"
        };
        var tableDataFromApi, tableDataFromDB;
        async.waterfall([
            // get the tables from the system
            function (callback) {
                request.post({
                    url: global["env"].testIp + 'Table/filterTables',
                    body: dataToSend,
                    json: true
                }, function (error, response, body) {
                    callback(error, body);
                });
            },
            // Get Tables Bots Details from Database
            function (data1, callback) {
                tableDataFromApi = data1.data.results;
                // console.log("tableDataFromApi---", tableDataFromApi);
                Tables.find({}).lean().exec(callback);
            },
            // Combine the Data Together to find no of actual users
            function (data2, callback) {
                tableDataFromDB = data2;
                // console.log("tableDataFromDB---", tableDataFromDB);
                _.each(tableDataFromApi, function (n) {
                    var sameTableFromDB = _.find(tableDataFromDB, function (m) {
                        return m.tableId == n._id;
                    });
                    if (sameTableFromDB) {
                        n.botCount = sameTableFromDB.bots.length;
                        n.actualUsers = n.noOfPlayers - n.botCount;
                        n.localTableDetails = sameTableFromDB;
                    } else {
                        n.botCount = 0;
                        n.actualUsers = n.noOfPlayers;
                    }
                });
                callback();
            },
            // run async eachLimit 10 for adding or removing
            function (callback) {
                async.eachSeries(tableDataFromApi, function (n, callback) {
                    tableInfoToSend.tableDetails = n;
                    tableInfoToSend.botDetails = data;
                    // console.log("tableInfoToSend", tableInfoToSend)
                    // n.actualUsers ==1
                    if (n.actualUsers == 1) {
                        if (n.botCount == 0 || n.botCount == 1) {
                            Bots.addSingleBotToTable(tableInfoToSend, callback);
                        } else if (n.botCount == 2) {
                            callback();
                        }
                    } else if (n.actualUsers == 2) {
                        if (n.botCount == 0 || n.botCount == 1) {
                            Bots.addSingleBotToTable(tableInfoToSend, callback);
                        } else if (n.botCount == 2) {
                            callback();
                        }
                    } else if (n.actualUsers == 3) {
                        if (n.botCount == 0) {
                            Bots.addSingleBotToTable(tableInfoToSend, callback);
                        } else if (n.botCount == 1) {
                            callback();
                        }
                    } else if (n.actualUsers == 4) {
                        if (n.botCount == 0) {
                            Bots.addSingleBotToTable(tableInfoToSend, callback);
                        } else if (n.botCount == 1) {
                            callback();
                        }
                    } else if (n.actualUsers == 0) {
                        Bots.removeBotFromEmptyTable(n, callback);
                        // callback();
                    }
                }, callback);
            }
        ], callback);
    },

    /**
     *  add bot to tables
     * 
     *  @param  {String} table data -   table data .      
     *  @returns  {callback} callback -   Return table Data.
     */
    addBotToTable: function (data, callback) {
        var botsData = {};
        var accessToken;
        async.waterfall([
                //find a bot
                function (callback) {
                    Bots.findOne({
                        $or: [{
                            "table": {
                                $exists: false
                            }
                        }, {
                            table: null
                        }]
                    }).exec(callback);
                },
                //add bot to LocalsystmsDbTable
                function (botData, callback) {
                    console.log("botData", botData)
                    if (botData || botData != null) {
                        async.waterfall([
                                //add bot to LocalsystmsDbTable
                                function (callback) {
                                    botsData = botData;
                                    accessToken = botData.accessToken;
                                    var tableDataToSave = {};
                                    tableDataToSave.tableId = data._id;
                                    tableDataToSave.json = data;
                                    tableDataToSave.bots = [];
                                    tableDataToSave.bots.push(botData._id);
                                    tableDataToSave.status = "InUse";
                                    Tables.saveData(tableDataToSave, callback);
                                },
                                //save tableId to respective bot
                                function (tabData, callback) {
                                    // console.log("tabData", tabData);
                                    // console.log("botsData", botsData);
                                    botsData.table = tabData._id;
                                    Bots.saveData(botsData, callback);
                                },
                                // getAll Data from server table
                                function (getAllData, callback) {
                                    if (!_.isEmpty(accessToken)) {
                                        var dataToSend = {};
                                        dataToSend.accessToken = accessToken;
                                        dataToSend.tableId = data._id;
                                        request.post({
                                            url: global["env"].testIp + 'Player/getAll',
                                            body: dataToSend,
                                            json: true
                                        }, function (error, response, body) {
                                            // console.log("body-----", body.data);
                                            callback(error, body);
                                        });
                                    }
                                },
                                //add bot to tableOnServer
                                function (finalData, callback) {
                                    var arrNumber = [1, 2, 3, 4, 5, 6, 7, 8, 9];
                                    var emptyPosition = [];
                                    emptyPosition = _.map(arrNumber, function (n) {
                                        var indx = _.findIndex(finalData.data.players, function (o) {
                                            return o.playerNo == n;
                                        });
                                        if (indx > -1) {
                                            return null
                                        } else {
                                            return n;
                                        };
                                    });
                                    if (emptyPosition[0] != null) {
                                        request.post({
                                            url: global["env"].testIp + 'Table/addUserToTable',
                                            body: {
                                                playerNo: emptyPosition[0],
                                                tableId: data._id,
                                                socketId: socketId,
                                                accessToken: accessToken
                                            },
                                            json: true
                                        }, function (error, response, body) {
                                            // console.log("body-########----", body);
                                            callback(error, body);
                                        });
                                    }
                                }
                            ],
                            callback);
                    } else {
                        callback()
                    }
                }
            ],
            callback);
    },


    /**
     *  remove bot from table Data
     * 
     *  @param  {String} table data -   table data.     
     *  @returns  {callback} callback -   Return table Data.
     */
    removeBotFromTable: function (data, callback) {
        var localTableData = {};
        async.waterfall([
                //find a tble from localDb
                function (callback) {
                    Tables.findOne({
                        tableId: data._id
                    }).deepPopulate('bots').exec(callback);
                },
                // remove bots from respective table on server
                function (tabData, callback) {
                    localTableData = tabData;
                    console.log("tabData", localTableData);
                    //remove from table
                    async.eachSeries(tabData.bots, function (n, callback) {
                        async.waterfall([
                                function (callback) {
                                    request.post({
                                        url: global["env"].testIp + 'Player/deletePlayer',
                                        body: {
                                            tableId: tabData.tableId,
                                            accessToken: n.accessToken
                                        },
                                        json: true
                                    }, function (error, response, body) {
                                        console.log("------------", body);
                                        callback(error, body);
                                    });
                                },
                                function (test, callback) {
                                    Bots.findOne({
                                        _id: n._id
                                    }).exec(function (err, data1) {
                                        console.log("-----------", data1)
                                        var dataToRemove = {};
                                        dataToRemove.table = '';
                                        dataToRemove._id = data1._id;
                                        console.log("------dataToRemove-----", dataToRemove)
                                        Bots.saveData(dataToRemove, callback);
                                    });
                                }
                            ],
                            callback);
                    }, callback);
                },
                function (test, callback) {
                    console.log("botsdata", botsdata);
                    Tables.delete({
                        _id: localTableData._id
                    }).exec(callback);
                }
            ],
            callback);
    },


    /**
     *  remove bot from table Data
     * 
     *  @param  {String} table data -   table data.     
     *  @returns  {callback} callback -   Return table Data.
     */
    removeBotFromEmptyTable: function (data, callback) {
        async.waterfall([
                function (callback) {
                    request.post({
                        url: global["env"].testIp + 'Player/getAll',
                        body: {
                            tableId: data._id,
                        },
                        json: true
                    }, function (error, response, body) {
                        callback(error, body);
                    });
                },
                function (playersData, callback) {
                    var botsData = {};
                    async.eachLimit(playersData.data.players, 10, function (n, callback) {
                        async.waterfall([
                                function (callback) {
                                    Bots.findOne({
                                        botId: n.memberId
                                    }).exec(callback);
                                },
                                function (botData, callback) {
                                    botsData = botData;
                                    if (botData) {
                                        async.waterfall([
                                                function (callback) {
                                                    request.post({
                                                        url: global["env"].testIp + 'Player/deletePlayer',
                                                        body: {
                                                            tableId: n.table,
                                                            accessToken: botData.accessToken
                                                        },
                                                        json: true
                                                    }, function (error, response, body) {
                                                        callback(error, body);
                                                    });
                                                },
                                                function (tData, callback) {
                                                    Tables.deleteData({
                                                        _id: botsData.table
                                                    }, callback);
                                                },
                                                function (tbData, callback) {
                                                    var dataToSave = {};
                                                    dataToSave._id = botsData._id;
                                                    dataToSave.table = null;
                                                    Bots.saveData(dataToSave, callback);
                                                }
                                            ],
                                            callback);
                                    }
                                },
                            ],
                            callback);
                    }, callback);
                }
            ],
            callback);
    },


    // //socket
    // showWinnerFunction: function (data, callback) {
    //     console.log("showWinnerFunction--", data);
    //     Bots.removeBotAfterShowWinner(data.data, callback)
    // },


    /**
     *  remove bot from table Data after show winner
     * 
     *  @param  {String} table data -   table data.     
     *  @returns  {callback} callback -   Return table Data.
     */
    removeBotAfterShowWinner: function (data) {
        var localTableData = {};
        async.waterfall([
                //find a tble from localDb
                function (callback) {
                    Tables.findOne({
                        tableId: data.pot.table
                    }).deepPopulate('bots').exec(callback);
                },
                function (test, callback) {
                    localTableData = test;
                    console.log("test", test)
                    request.post({
                        url: global["env"].testIp + 'Player/getAll',
                        body: {
                            tableId: data.pot.table,
                        },
                        json: true
                    }, function (error, response, body) {
                        console.log("body", body)
                        callback(error, body);
                    });
                },
                // remove bots from respective table on server
                function (tabData, callback) {
                    // console.log("localTableData", localTableData.bots.length);
                    var botLength = localTableData.bots.length;
                    var playersLength = tabData.data.players.length;
                    var actualPlayerLength = playersLength - botLength;
                    // console.log("tabData", tabData.data.players.length)
                    // console.log("actualLength", actualPlayerLength)
                    if (actualPlayerLength >= 5 && botLength >= 1) {
                        Bots.deleteBot(localTableData, callback)
                    } else if (actualPlayerLength == 4 && botLength > 1) {
                        _.pullAt(localTableData.bots, 0);
                        Bots.deleteBot(localTableData, callback)
                    } else if (actualPlayerLength == 3 && botLength > 1) {
                        _.pullAt(localTableData.bots, 0);
                        Bots.deleteBot(localTableData, callback)
                    } else if (actualPlayerLength == 2 && botLength > 2) {
                        _.pullAt(localTableData.bots, [0, 1]);
                        Bots.deleteBot(localTableData, callback)
                    } else if (actualPlayerLength == 1 && botLength > 2) {
                        _.pullAt(localTableData.bots, [0, 1]);
                        Bots.deleteBot(localTableData, callback)
                    } else {
                        callback()
                    }
                }
            ],
            function () {});
    },


    deleteBot: function (data, callback) {
        async.eachSeries(data.bots, function (n, callback) {
            // console.log("data.tableId", data.tableId);
            // console.log("n.accessToken", n.accessToken)
            async.waterfall([
                    function (callback) {
                        request.post({
                            url: global["env"].testIp + 'Player/deletePlayer',
                            body: {
                                tableId: data.tableId,
                                accessToken: n.accessToken
                            },
                            json: true
                        }, function (error, response, body) {
                            console.log("body-----------", body);
                            callback(error, body);
                        });
                    },
                    function (test, callback) {
                        Tables.deleteData({
                            _id: data._id
                        }, callback);
                    },
                    function (test, callback) {
                        Bots.findOne({
                            _id: n._id
                        }).exec(function (err, data1) {
                            var dataToSave = {};
                            dataToSave._id = n._id;
                            dataToSave.table = null;
                            Bots.saveData(dataToSave, callback);
                        });
                    }
                ],
                callback);
        }, callback);
    },


    /**
     *  socket function
     * 
     *  @returns  {callback} callback -   Return socket Data.
     */
    // updateSocketFunction: function (data, callback) {
    //     Bots.botGamePlay(data.data, callback);
    // },


    /**
     *  bot gameplay 
     * 
     *  @param  {String} socket data -   socket data.     
     *  @returns  {callback} callback -   Return game data.
     */
    botGamePlay: function (playerId, data) {
        // console.log("botGamePlay", data);
        // console.log("playerData", playerData);
        var isPlayer = _.find(data.updatedSocketData.players, function (m) {
            return m.memberId == playerId;
        });
        console.log("isPlayer", isPlayer);

        if (data.updatedSocketData.extra.serve || data.updatedSocketData.extra.newGame) {
            var indexValue = _.findIndex(global.allBots, function (o) {
                return o.botId == playerId;
            });
            var m = global.allBots[indexValue];
            m.blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
            m.chalCount = 50;
            m.chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
            m.chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
            m.chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
            m.chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
            m.chalCountHC = 2;
            // global.allBots[indxVal].blindCount--;
            console.log("in new game=======", global.allBots)
        } else {
            if (isPlayer && isPlayer.isTurn) {
                console.log("isPlayer", isPlayer);
                var dataForSeenCards = {};
                var dataToChaal = {};
                var blindStatus = _.find(data.updatedSocketData.players, function (m) {
                    return m.isBlind == false;
                });
                var value = _.find(global.allBots, function (n) {
                    return _.isEqual(n.botId, isPlayer.memberId);
                });
                console.log("value inside GamePlay-------", value);
                if (value) {
                    if (_.isEmpty(blindStatus)) {
                        if (value.blindCount > 0) {
                            setTimeout(function () {
                                request.post({
                                    url: global["env"].testIp + 'Player/chaal',
                                    body: {
                                        tableId: isPlayer.table,
                                        accessToken: data.currentBotAdded.accessToken,
                                        amount: data.updatedSocketData.minAmt
                                    },
                                    json: true
                                }, function (error, response, body) {
                                    var indxVal = _.findIndex(global.allBots, function (o) {
                                        return o.botId == value.botId;
                                    });
                                    global.allBots[indxVal].blindCount--;
                                    console.log("indxVal", global.allBots[indxVal]);
                                    console.log("value.blindCount", global.allBots[indxVal].blindCount);
                                    // console.log("body>>>>>>>--", body);
                                    // callback(error, body);
                                });
                            }, 3000);
                        } else {
                            request.post({
                                url: global["env"].testIp + 'Player/makeSeen',
                                body: {
                                    tableId: isPlayer.table,
                                    accessToken: data.currentBotAdded.accessToken,
                                },
                                json: true
                            }, function (error, response, body) {
                                // value.blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
                                // callback(error, body);
                            });
                        }
                    } else {
                        if (isPlayer.isBlind == true) {
                            request.post({
                                url: global["env"].testIp + 'Player/makeSeen',
                                body: {
                                    tableId: isPlayer.table,
                                    accessToken: data.currentBotAdded.accessToken,
                                },
                                json: true
                            }, function (error, response, body) {
                                value.blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
                                // callback(error, body);
                            });
                        } else {
                            var dataToCheckCards = {};
                            if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsNormal') {
                                dataToCheckCards.type = 'scoreHandsNormal';
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsNormal(isPlayer.cards);
                                dataToCheckCards.values = value;
                                Bots.checkCards(dataToCheckCards, function () {});
                            } else if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsTwo') {
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsTwo(isPlayer.cards);
                                dataToCheckCards.values = value;
                                Bots.checkCards(dataToCheckCards, function () {});
                            } else if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsFour') {
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsFour(isPlayer.cards);
                                dataToCheckCards.values = value;
                                Bots.checkCards(dataToCheckCards, function () {});
                            } else if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsLowest') {
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsLowest(isPlayer.cards);
                                dataToCheckCards.values = value;
                                Bots.checkCards(dataToCheckCards, function () {});
                            } else if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsJoker') {
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsJoker(isPlayer.cards);
                                dataToCheckCards.values = value;
                                Bots.checkCards(dataToCheckCards, function () {});
                            }
                        }
                    }
                }
            }
        }
    },


    /**
     *  match cards types
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    checkCards: function (data, callback) {
        // console.log("data--", data)
        // var value = _.find(global.allBots, function (n) {
        //     return _.isEqual(n.botId, data.values.botId);
        // });
        if (data.handNormal.name == 'Trio') {
            if (data.values.chalCount > 0) {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/chaal',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                            amount: data.maxAmt
                        },
                        json: true
                    }, function (error, response, body) {
                        var indxVal = _.findIndex(global.allBots, function (o) {
                            return o.botId == data.values.botId;
                        });
                        global.allBots[indxVal].chalCount--;
                        console.log("chalCount", global.allBots[indxVal]);
                        callback(error, body);
                    });
                }, 3000);
            } else {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/showWinner',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                        },
                        json: true
                    }, function (error, response, body) {
                        // value.chalCount = 50;
                        console.log("chalCount", data.values.chalCount);
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'Pure Sequence') {
            // chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
            if (data.values.chalCountPS > 0) {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/chaal',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                            amount: data.maxAmt
                        },
                        json: true
                    }, function (error, response, body) {
                        // data.values.chalCountPS--;
                        var indxVal = _.findIndex(global.allBots, function (o) {
                            return o.botId == data.values.botId;
                        });
                        global.allBots[indxVal].chalCountPS--;
                        console.log("chalCountPS", global.allBots[indxVal]);
                        callback(error, body);
                    });
                }, 3000);
            } else {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/showWinner',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                        },
                        json: true
                    }, function (error, response, body) {
                        // value.chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'Sequence') {
            // chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
            if (data.values.chalCountS > 0) {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/chaal',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                            amount: data.maxAmt
                        },
                        json: true
                    }, function (error, response, body) {
                        // data.values.chalCountS--;
                        var indxVal = _.findIndex(global.allBots, function (o) {
                            return o.botId == data.values.botId;
                        });
                        global.allBots[indxVal].chalCountS--;
                        console.log("chalCountS", global.allBots[indxVal]);
                        callback(error, body);
                    });
                }, 3000);
            } else {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/showWinner',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                        },
                        json: true
                    }, function (error, response, body) {
                        // value.chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'Color') {
            // chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
            if (data.values.chalCountC > 0) {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/chaal',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                            amount: data.maxAmt
                        },
                        json: true
                    }, function (error, response, body) {
                        // data.values.chalCountC--;
                        var indxVal = _.findIndex(global.allBots, function (o) {
                            return o.botId == data.values.botId;
                        });
                        global.allBots[indxVal].chalCountC--;
                        console.log("chalCountC", global.allBots[indxVal]);
                        callback(error, body);
                    });
                }, 3000);
            } else {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/showWinner',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                        },
                        json: true
                    }, function (error, response, body) {
                        // value.chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'Pair') {
            // chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
            if (data.values.chalCountP > 0) {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/chaal',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                            amount: data.maxAmt
                        },
                        json: true
                    }, function (error, response, body) {
                        // data.values.chalCountP--;
                        var indxVal = _.findIndex(global.allBots, function (o) {
                            return o.botId == data.values.botId;
                        });
                        global.allBots[indxVal].chalCountP--;
                        console.log("chalCountP", global.allBots[indxVal]);
                        callback(error, body);
                    });
                }, 3000);
            } else {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/showWinner',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                        },
                        json: true
                    }, function (error, response, body) {
                        // value.chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'High Card') {
            // chalCountHC = Math.floor(Math.random() * (1 - 0 + 1)) + 1;
            if (data.values.chalCountHC > 0) {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/chaal',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                            amount: data.maxAmt
                        },
                        json: true
                    }, function (error, response, body) {
                        // data.values.chalCountHC--;
                        var indxVal = _.findIndex(global.allBots, function (o) {
                            return o.botId == data.values.botId;
                        });
                        global.allBots[indxVal].chalCountHC--;
                        console.log("chalCountHC", global.allBots[indxVal]);
                        callback(error, body);
                    });
                }, 3000);
            } else {
                setTimeout(function () {
                    request.post({
                        url: global["env"].testIp + 'Player/fold',
                        body: {
                            tableId: data.botData.table,
                            accessToken: data.accessToken,
                        },
                        json: true
                    }, function (error, response, body) {
                        // value.chalCountHC = 2;
                        callback(error, body);
                    });
                }, 3000);
            }
        }
    },


    //socket
    // sideShowSocket: function (data, callback) {
    //     // console.log("sideShowSocket--", data);
    //     Bots.sideShowLogic(data.data, callback);
    // },

    /**
     *  side show logic
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    sideShowLogic: function (data) {
        console.log("data--", data);
        var localTableData = {};
        async.waterfall([
                //find a tble from localDb
                function (callback) {
                    Tables.findOne({
                        tableId: data.toPlayer.table
                    }).deepPopulate('bots').exec(callback);
                },
                function (test, callback) {
                    localTableData = test;
                    console.log("localTableData", localTableData)
                    request.post({
                        url: global["env"].testIp + 'Player/getAll',
                        body: {
                            tableId: data.toPlayer.table,
                        },
                        json: true
                    }, function (error, response, body) {
                        callback(error, body);
                    });
                },
                // remove bots from respective table on server
                function (tabData, callback) {
                    console.log("tabDatatabDatatabData", tabData)
                    var isPresent = _.find(localTableData.bots, function (o) {
                        return o.botId == data.toPlayer.memberId;
                    })
                    if (!_.isEmpty(isPresent)) {
                        var dataToCheckSSCards = {};
                        if (tabData.data.gameType.evaluateFunc == 'scoreHandsNormal') {
                            dataToCheckSSCards.table = data.toPlayer.table;
                            dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                            dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsNormal(data.toPlayer.cards);
                            console.log("dataToCheckSSCards", dataToCheckSSCards);
                            Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                        } else if (tabData.data.gameType.evaluateFunc == 'scoreHandsTwo') {
                            dataToCheckSSCards.table = data.toPlayer.table;
                            dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                            dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsTwo(data.toPlayer.cards);
                            console.log("dataToCheckSSCards", dataToCheckSSCards);
                            Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                        } else if (tabData.data.gameType.evaluateFunc == 'scoreHandsFour') {
                            dataToCheckSSCards.table = data.toPlayer.table;
                            dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                            dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsFour(data.toPlayer.cards);
                            Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                        } else if (tabData.data.gameType.evaluateFunc == 'scoreHandsLowest') {
                            dataToCheckSSCards.table = data.toPlayer.table;
                            dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                            dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsLowest(data.toPlayer.cards);
                            Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                        } else if (tabData.data.gameType.evaluateFunc == 'scoreHandsJoker') {
                            dataToCheckSSCards.table = data.toPlayer.table;
                            dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                            dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsJoker(data.toPlayer.cards);
                            Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                        }
                    } else {
                        callback();
                    }
                }
            ],
            function () {});
    },

    /**
     *  match cards types for sideShow
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    checkCardsForSideShow: function (data, callback) {
        console.log("data--", data)
        if (data.handNormal.name == 'Trio') {
            setTimeout(function () {
                request.post({
                    url: global["env"].testIp + 'Player/cancelSideShow',
                    body: {
                        tableId: data.table,
                        accessToken: data.accessToken
                    },
                    json: true
                }, function (error, response, body) {
                    callback(error, body);
                });
            }, 3000);
        } else if (data.handNormal.name == 'Pure Sequence') {
            setTimeout(function () {
                request.post({
                    url: global["env"].testIp + 'Player/cancelSideShow',
                    body: {
                        tableId: data.table,
                        accessToken: data.accessToken
                    },
                    json: true
                }, function (error, response, body) {
                    callback(error, body);
                });
            }, 3000);
        } else if (data.handNormal.name == 'Sequence') {
            setTimeout(function () {
                request.post({
                    url: global["env"].testIp + 'Player/cancelSideShow',
                    body: {
                        tableId: data.table,
                        accessToken: data.accessToken
                    },
                    json: true
                }, function (error, response, body) {
                    callback(error, body);
                });
            }, 3000);
        } else if (data.handNormal.name == 'Color') {
            setTimeout(function () {
                request.post({
                    url: global["env"].testIp + 'Player/doSideShow',
                    body: {
                        tableId: data.table,
                        accessToken: data.accessToken
                    },
                    json: true
                }, function (error, response, body) {
                    callback(error, body);
                });
            }, 3000);
        } else if (data.handNormal.name == 'Pair') {
            setTimeout(function () {
                request.post({
                    url: global["env"].testIp + 'Player/doSideShow',
                    body: {
                        tableId: data.table,
                        accessToken: data.accessToken
                    },
                    json: true
                }, function (error, response, body) {
                    callback(error, body);
                });
            }, 3000);
        } else if (data.handNormal.name == 'High Card') {
            setTimeout(function () {
                request.post({
                    url: global["env"].testIp + 'Player/doSideShow',
                    body: {
                        tableId: data.table,
                        accessToken: data.accessToken
                    },
                    json: true
                }, function (error, response, body) {
                    callback(error, body);
                });
            }, 3000);
        }
    },

    //socket
    removePlayer: function (data) {
        console.log("removePlayerSocket--+++++++++++++", data);
        var localData = {};
        async.waterfall([
                function (callback) {
                    Tables.findOne({
                        tableId: data.table
                    }).deepPopulate('bots').exec(callback);
                },
                function (tableData, callback) {
                    localData = tableData;
                    var isPre = _.remove(tableData.bots, function (x) {
                        return x.botId == data.memberId
                    })
                    if (!_.isEmpty(tableData.bots)) {
                        var dataToSave = {};
                        dataToSave._id = tableData._id;
                        dataToSave.bots = tableData.bots;
                        Tables.saveData(dataToSave, callback);
                    } else {
                        Tables.deleteData({
                            _id: tableData._id
                        }, callback);
                    }
                },
                function (tbData, callback) {
                    Bots.findOne({
                        botId: data.memberId
                    }).exec(function (err, data1) {
                        var dataToRemove = {};
                        dataToRemove.table = null;
                        dataToRemove._id = data1._id;
                        Bots.saveData(dataToRemove, callback);
                    });
                }
            ],
            function () {});
    },

    /**
     *  search for free bots
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    searchForFreeBots: function (data, callback) {
        async.waterfall([
                function (callback) {
                    Bots.findOne({
                        $or: [{
                            "table": {
                                $exists: false
                            }
                        }, {
                            table: null
                        }]
                    }).exec(callback);
                },
                function (botData, callback) {
                    // async.eachSeries(botData, function (n, callback) {
                    // var n = botData[0];
                    // Bots.getTableInfo(n, callback)
                    // }, callback);
                    Bots.getTableInfo(botData, callback);
                }
            ],
            callback);
    },


    /**
     *  add single bot to table
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    addSingleBotToTable: function (data, callback) {
        // console.log("data------------------", data);
        var tblData = {}
        async.waterfall([
                function (callback) {
                    if (data.tableDetails.localTableDetails) {
                        var updateTblData = {};
                        updateTblData = data.tableDetails.localTableDetails;
                        updateTblData.bots.push(data.botDetails._id);
                        Tables.findOneAndUpdate({
                            _id: updateTblData._id
                        }, {
                            bots: updateTblData.bots
                        }, {
                            new: true
                        }).deepPopulate('bots').exec(function (err, dd) {
                            tblData = dd;
                            callback(null, dd);
                        });
                    } else {
                        var tableDataToSave = {};
                        tableDataToSave.tableId = data.tableDetails._id;
                        tableDataToSave.json = data.tableDetails;
                        tableDataToSave.bots = [];
                        tableDataToSave.bots.push(data.botDetails._id);
                        const table = new Tables(tableDataToSave);
                        table.save().then(table => {
                            table.populate('bots', function (err, order) {
                                tblData = order;
                                callback(null, order)
                            });
                        });
                    }
                },
                //save tableId to respective bot
                function (tabData, callback) {
                    // console.log("tabData", tabData);
                    var botsData = {};
                    botsData = data.botDetails;
                    botsData.table = tblData._id;
                    Bots.saveData(botsData, callback);
                },
                // getAll Data from server table
                function (getAllData, callback) {
                    var dataToSend = {};
                    // dataToSend.accessToken = data.botDetails.accessToken;
                    dataToSend.tableId = data.tableDetails._id;
                    request.post({
                        url: global["env"].testIp + 'Player/getAll',
                        body: dataToSend,
                        json: true
                    }, function (error, response, body) {
                        // console.log("body-----", body.data);
                        callback(error, body);
                    });
                },
                //add bot to tableOnServer
                function (finalData, callback) {
                    // console.log("finalData", finalData.data.players);
                    var arrNumber = [1, 2, 3, 4, 5, 6, 7, 8, 9];
                    var emptyPosition = [];
                    emptyPosition = _.map(arrNumber, function (n) {
                        var indx = _.findIndex(finalData.data.players, function (o) {
                            return o.playerNo == n;
                        });
                        if (indx > -1) {
                            return null
                        } else {
                            return n;
                        };
                    });

                    var emptyNumArr = _.groupBy(emptyPosition, function (n) {
                        return n != null
                    })
                    request.post({
                        url: global["env"].testIp + 'Table/addUserToTable',
                        body: {
                            playerNo: emptyNumArr.true[0],
                            tableId: tblData.tableId,
                            socketId: socketId,
                            accessToken: data.botDetails.accessToken
                        },
                        json: true
                    }, function (error, response, body) {
                        var value = _.find(global.allBots, function (n) {
                            return _.isEqual(n._id, data.botDetails._id);
                        })

                        // console.log("body-########----", body);
                        callback(error, body);

                        var updateSocket = function (usData) {
                            // console.log("usData", usData)
                            // if (usData.data.extra.serve || usData.data.extra.newGame) {
                            //     console.log("in new game=======")
                            //     _.each(tblData.bots, function (n) {
                            //         global.allBots = _.map(global.allBots, function (m) {
                            //             if (n.botId == m.botId) {
                            //                 m.blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
                            //                 m.chalCount = 50;
                            //                 m.chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
                            //                 m.chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
                            //                 m.chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
                            //                 m.chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
                            //                 m.chalCountHC = 2;
                            //             }
                            //             return m;
                            //         });
                            //     });
                            //     console.log("in new game=======", global.allBots)
                            // }
                            // var isPlayerTurn = _.find(usData.data.players, function (m) {
                            //     return m.isTurn == true;
                            // });
                            // if (isPlayerTurn) {

                            // }
                            var allBotDataToSend = {};
                            allBotDataToSend.botsPresent = tblData.bots;
                            allBotDataToSend.currentBotAdded = body.data;
                            allBotDataToSend.updatedSocketData = usData.data;
                            console.log("body.data.memberId", body.data)
                            Bots.botGamePlay(body.data.memberId, allBotDataToSend);
                        }
                        socket.on("Update", updateSocket);

                        value.update = updateSocket;
                        value.blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
                        value.chalCount = 50;
                        value.chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
                        value.chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
                        value.chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
                        value.chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
                        value.chalCountHC = 2;
                        // console.log("valueIN ADD", value);



                        // //for show winnner

                        // var showWinnerSocket = function (data) {
                        //     Bots.removeBotAfterShowWinner(data.data)
                        // }
                        // socket.on("showWinner", showWinnerSocket);

                        // var value1 = _.find(global.allBots, function (n) {
                        //     return _.isEqual(n._id, data.botDetails._id)
                        // });

                        // value1.showWinner = showWinnerSocket;

                        // //for side show

                        // var sideShowSocket = function (data) {
                        //     Bots.sideShowLogic(data.data);
                        // }
                        // socket.on("sideShow", sideShowSocket);

                        // var value2 = _.find(global.allBots, function (n) {
                        //     return _.isEqual(n._id, data.botDetails._id)
                        // });

                        // value2.sideShow = sideShowSocket;

                        // //for remove 

                        // var removePlayerSocket = function (data) {
                        //     Bots.removePlayer(data.data);
                        // }
                        // socket.on("removePlayer", removePlayerSocket);

                        // var value3 = _.find(global.allBots, function (n) {
                        //     return _.isEqual(n._id, data.botDetails._id)
                        // });

                        // value3.removePlayer = removePlayerSocket;
                    });
                }
            ],
            callback);
    },
};

/**
 *  cancel a order.
 * 
 *  @param  {String} id -   specific market symbol.
 *  @returns  {callback} callback -   Return cancel order details.
 */
// cron.schedule('*/5 * * * * *', function () {
//     console.log("-")
//     model.searchForFreeBots();
// });


socket.on('connect', function () {
    global.socketId = socket.io.engine.id;
    // console.log("***************", global.socketId = socket.io.engine.id);
});


sails.on("ready", function () {
    Bots.find({}, {
        botId: 1,
        _id: 1
    }).lean().exec(function (err, data) {
        global.allBots = data;
    });
});

module.exports = _.assign(module.exports, exports, model);