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
                    } else if (n.actualUsers == 0 && n.botCount > 0) {
                        Bots.removeBotFromEmptyTable(n, callback);
                        // callback();
                    } else {
                        callback()
                    }
                }, callback);
            }
        ], callback);
    },


    /**
     *  remove bot from table Data
     * 
     *  @param  {String} table data -   table data.     
     *  @returns  {callback} callback -   Return table Data.
     */
    removeBotFromEmptyTable: function (data, callback) {
        // console.log("removeBotFromEmptyTable", data)
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
                    // console.log("playersData", playersData);
                    var botsData = {};
                    async.eachSeries(playersData.data.players, function (n, callback) {
                        var indexValue = _.findIndex(global.allBots, function (o) {
                            return _.isEqual(o.botId, n.memberId);
                        });
                        async.waterfall([
                                function (callback) {
                                    Bots.findOne({
                                        botId: n.memberId
                                    }).exec(callback);
                                },
                                function (botData, callback) {
                                    botsData = botData;
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
                                                    console.log("removeBotFromEmptyTable111", body)
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
                                                socket.off("Update_" + n.table, global.allBots[indexValue].update);
                                                socket.off("sideShow_" + n.table, global.allBots[indexValue].sideShow);
                                                socket.off("removePlayer_" + n.table, global.allBots[indexValue].removePlayer);
                                                socket.off("showWinner_" + n.table, global.allBots[indexValue].showWinner);
                                                _.pullAt(global.allBots, indexValue);
                                                // console.log("removeBotFromEmptyTable222");
                                                Bots.saveData(dataToSave, callback);
                                            }
                                        ],
                                        callback);

                                },
                            ],
                            callback);
                    }, callback);
                }
            ],
            callback);
    },


    /**
     *  remove bot from table Data after show winner
     * 
     *  @param  {String} table data -   table data.     
     *  @returns  {callback} callback -   Return table Data.
     */
    removeBotAfterShowWinner: function (data) {
        var localTableData = {};
        var botsToRemove = {};
        var dataForRemoveBot = {};

        vshowWinnerPreviousPotAmt = -1;
        var showWinnerCurrentPotAmt = data.pot.totalAmount;
        if (global.showWinnerPreviousPotAmt != showWinnerCurrentPotAmt) {
            global.showWinnerPreviousPotAmt = showWinnerCurrentPotAmt;
            // console.log("removeBotAfterShowWinner", data);
            async.waterfall([
                    //find a tble from localDb
                    function (callback) {
                        Tables.findOne({
                            tableId: data.pot.table
                        }).deepPopulate('bots').exec(callback);
                    },
                    function (test, callback) {
                        localTableData = test;
                        request.post({
                            url: global["env"].testIp + 'Player/getAll',
                            body: {
                                tableId: data.pot.table,
                            },
                            json: true
                        }, function (error, response, body) {
                            // console.log("body", body)
                            callback(error, body);
                        });
                    },
                    // remove bots from respective table on server
                    function (tabData, callback) {
                        var botLength = localTableData.bots.length;
                        var playersLength = tabData.data.players.length;
                        var actualPlayerLength = playersLength - botLength;
                        if (actualPlayerLength >= 5 && botLength >= 1) {
                            dataForRemoveBot.bots = localTableData.bots;
                            dataForRemoveBot.localTableData = localTableData;
                            dataForRemoveBot.isDelete = true;
                            Bots.deleteBot(dataForRemoveBot, callback);
                        } else if (actualPlayerLength == 4 && botLength > 1) {
                            botsToRemove = localTableData.bots.splice(0, localTableData.bots.length - 1);
                            dataForRemoveBot.bots = botsToRemove;
                            dataForRemoveBot.localTableData = localTableData;
                            Bots.deleteBot(dataForRemoveBot, callback);
                        } else if (actualPlayerLength == 3 && botLength > 1) {
                            botsToRemove = localTableData.bots.splice(0, localTableData.bots.length - 1);
                            dataForRemoveBot.bots = botsToRemove;
                            dataForRemoveBot.localTableData = localTableData;
                            Bots.deleteBot(dataForRemoveBot, callback);
                        } else if (actualPlayerLength == 2 && botLength > 1) {
                            // console.log("actualPlayerLength == 2 && botLength > 1");
                            botsToRemove = localTableData.bots.splice(0, localTableData.bots.length - 1);
                            dataForRemoveBot.bots = botsToRemove;
                            dataForRemoveBot.localTableData = localTableData;
                            Bots.deleteBot(dataForRemoveBot, callback);
                        } else if (actualPlayerLength == 1 && botLength > 2) {
                            botsToRemove = localTableData.bots.splice(0, localTableData.bots.length - 2);
                            dataForRemoveBot.bots = botsToRemove;
                            dataForRemoveBot.localTableData = localTableData;
                            Bots.deleteBot(dataForRemoveBot, callback);
                        }
                    }
                ],
                function () {});
        }
    },


    deleteBot: function (data, callback) {
        // console.log("In Delete Function ", data);
        async.waterfall([
                function (callback) {
                    if (data.isDelete) {
                        Tables.deleteData({
                            _id: data.localTableData._id
                        }, callback);
                    } else {
                        Tables.saveData(data.localTableData, callback);
                    }
                },
                function (testData, callback) {
                    async.eachSeries(data.bots, function (n, callback) {
                        // console.log(" data.localTableData.tableId", data.localTableData.tableId);
                        // console.log("n.accessToken", n.accessToken);
                        var indexValue = _.findIndex(global.allBots, function (o) {
                            return _.isEqual(o.botId, n.botId);
                        });
                        async.waterfall([
                                function (callback) {
                                    request.post({
                                        url: global["env"].testIp + 'Player/deletePlayer',
                                        body: {
                                            tableId: data.localTableData.tableId,
                                            accessToken: n.accessToken
                                        },
                                        json: true
                                    }, function (error, response, body) {
                                        // console.log("body-----------", body);
                                        callback(error, body);
                                    });
                                },
                                function (test, callback) {
                                    Bots.findOne({
                                        _id: n._id
                                    }).exec(function (err, data1) {
                                        socket.off("Update_" + data.localTableData.tableId, global.allBots[indexValue].update);
                                        socket.off("sideShow_" + data.localTableData.tableId, global.allBots[indexValue].sideShow);
                                        socket.off("removePlayer_" + data.localTableData.tableId, global.allBots[indexValue].removePlayer);
                                        socket.off("showWinner_" + data.localTableData.tableId, global.allBots[indexValue].showWinner);
                                        _.pullAt(global.allBots, indexValue);
                                        var dataToSave = {};
                                        dataToSave._id = n._id;
                                        dataToSave.table = null;
                                        Bots.saveData(dataToSave, callback);
                                    });
                                }
                            ],
                            callback);
                    }, callback);
                }
            ],
            callback);
    },

    /**
     *  bot gameplay 
     * 
     *  @param  {String} socket data -   socket data.     
     *  @returns  {callback} callback -   Return game data.
     */
    botGamePlay: function (playerId, data) {
        if (data.updatedSocketData.pot) {
            var currentPotAmount = data.updatedSocketData.pot.totalAmount;
        }
        var isPlayer = _.find(data.updatedSocketData.players, function (m) {
            return m.memberId == playerId;
        });
        var indexValue = _.findIndex(global.allBots, function (o) {
            return _.isEqual(o.botId, playerId);
        });
        if (data.updatedSocketData.extra.serve || data.updatedSocketData.extra.newGame) {
            var m = global.allBots[indexValue];
            m.blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
            m.chalCount = 50;
            m.chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
            m.chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
            m.chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
            m.chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
            m.chalCountHC = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
            m.lastPotAmount = -1;
            // console.log("in new game=======", global.allBots[indexValue]);
        } else {
            if (isPlayer && isPlayer.isTurn && global.allBots[indexValue].lastPotAmount != currentPotAmount) {
                global.allBots[indexValue].lastPotAmount = currentPotAmount;
                // console.log("for isPlayer", isPlayer.name);
                var dataForSeenCards = {};
                var dataToChaal = {};
                var blindStatus = _.find(data.updatedSocketData.players, function (m) {
                    return m.isBlind == false;
                });
                // console.log("global.allBots[indexValue] inside GamePlay-------", global.allBots[indexValue]);
                if (_.isEmpty(blindStatus)) {
                    if (global.allBots[indexValue].blindCount > 0) {
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
                                global.allBots[indexValue].blindCount--;
                                // callback(error, body);
                            });
                        }, _.random(2000, 6000));
                    } else {
                        global.allBots[indexValue].lastPotAmount = -1;
                        request.post({
                            url: global["env"].testIp + 'Player/makeSeen',
                            body: {
                                tableId: isPlayer.table,
                                accessToken: data.currentBotAdded.accessToken,
                            },
                            json: true
                        }, function (error, response, body) {
                            // callback(error, body);
                        });
                    }
                } else {
                    // console.log("inElse ");
                    if (isPlayer.isBlind == true) {
                        global.allBots[indexValue].lastPotAmount = -1;
                        // console.log("isPlayer.isBlind true ");
                        request.post({
                            url: global["env"].testIp + 'Player/makeSeen',
                            body: {
                                tableId: isPlayer.table,
                                accessToken: data.currentBotAdded.accessToken,
                            },
                            json: true
                        }, function (error, response, body) {
                            // callback(error, body);
                        });
                    } else {
                        // console.log("isPlayer.isBlind false ");
                        var dataToCheckCards = {};
                        if (isPlayer.cards[0] == '') {
                            global.allBots[indexValue].lastPotAmount = -1;
                        } else {
                            global.allBots[indexValue].playerCards = isPlayer.cards;
                            if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsNormal') {
                                dataToCheckCards.type = 'scoreHandsNormal';
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsNormal(isPlayer.cards);
                                dataToCheckCards.indexValue = indexValue;
                                Bots.checkCards(dataToCheckCards, function () {});
                            } else if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsTwo') {
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsTwo(isPlayer.cards);
                                dataToCheckCards.indexValue = indexValue;
                                Bots.checkCards(dataToCheckCards, function () {});
                            } else if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsFour') {
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsFour(isPlayer.cards);
                                dataToCheckCards.indexValue = indexValue;
                                Bots.checkCards(dataToCheckCards, function () {});
                            } else if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsLowest') {
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsLowest(isPlayer.cards);
                                dataToCheckCards.indexValue = indexValue;
                                Bots.checkCards(dataToCheckCards, function () {});
                            } else if (data.updatedSocketData.gameType.evaluateFunc == 'scoreHandsJoker') {
                                dataToCheckCards.botData = isPlayer;
                                dataToCheckCards.minAmt = data.updatedSocketData.minAmt;
                                dataToCheckCards.maxAmt = data.updatedSocketData.maxAmt;
                                dataToCheckCards.accessToken = data.currentBotAdded.accessToken;
                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsJoker(isPlayer.cards);
                                dataToCheckCards.indexValue = indexValue;
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
        // console.log("checkCards+++++++++++++++++++++--", data)
        if (data.handNormal.name == 'Trio') {
            if (global.allBots[data.indexValue].chalCount > 0) {
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
                        global.allBots[data.indexValue].chalCount--;
                        // console.log("chalCount", global.allBots[data.indexValue]);
                        console.log("data.handNormal.name", data.handNormal.name);
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
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
                        // console.log("chalCount", global.allBots[data.indexValue].chalCount);
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
            }
        } else if (data.handNormal.name == 'Pure Sequence') {
            if (global.allBots[data.indexValue].chalCountPS > 0) {
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
                        global.allBots[data.indexValue].chalCountPS--;
                        // console.log("chalCountPS", global.allBots[data.indexValue]);
                        console.log("data.handNormal.name", data.handNormal.name);
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
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
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
            }
        } else if (data.handNormal.name == 'Sequence') {
            if (global.allBots[data.indexValue].chalCountS > 0) {
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
                        global.allBots[data.indexValue].chalCountS--;
                        // console.log("chalCountS", global.allBots[data.indexValue]);
                        console.log("data.handNormal.name", data.handNormal.name);
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
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
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
            }
        } else if (data.handNormal.name == 'Color') {
            if (global.allBots[data.indexValue].chalCountC > 0) {
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
                        global.allBots[data.indexValue].chalCountC--;
                        // console.log("chalCountC", global.allBots[data.indexValue]);
                        console.log("data.handNormal.name", data.handNormal.name);
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
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
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
            }
        } else if (data.handNormal.name == 'Pair') {
            if (global.allBots[data.indexValue].chalCountP > 0) {
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
                        global.allBots[data.indexValue].chalCountP--;
                        // console.log("chalCountP", global.allBots[data.indexValue]);
                        console.log("data.handNormal.name", data.handNormal.name);
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
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
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
            }
        } else if (data.handNormal.name == 'High Card') {
            if (global.allBots[data.indexValue].chalCountHC > 0) {
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
                        global.allBots[data.indexValue].chalCountHC--;
                        // console.log("chalCountHC", global.allBots[data.indexValue]);
                        console.log("data.handNormal.name", data.handNormal.name);
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
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
                        callback(error, body);
                    });
                }, _.random(2000, 6000));
            }
        }
    },

    /**
     *  side show logic
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    sideShowLogic: function (playerId, data) {
        // console.log("data--", data);
        var indexValue = _.findIndex(global.allBots, function (o) {
            return _.isEqual(o.botId, data.toPlayer.memberId);
        });
        var currentAmountForSideShow = data.toPlayer.totalAmount;
        async.waterfall([
                function (callback) {
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
                function (tabData, callback) {
                    if (data.toPlayer.memberId == playerId && global.allBots[indexValue].lastSideShowAmount != currentAmountForSideShow) {
                        global.allBots[indexValue].lastSideShowAmount = currentAmountForSideShow;
                        // console.log("inside", data.toPlayer);
                        console.log("playerId--", playerId);
                        if (data.toPlayer.cards[0] == '') {
                            global.allBots[indexValue].lastSideShowAmount = -1;
                        } else {
                            var dataToCheckSSCards = {};
                            if (tabData.data.gameType.evaluateFunc == 'scoreHandsNormal') {
                                dataToCheckSSCards.table = data.toPlayer.table;
                                dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                                dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsNormal(global.allBots[indexValue].playerCards);
                                Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                            } else if (tabData.data.gameType.evaluateFunc == 'scoreHandsTwo') {
                                dataToCheckSSCards.table = data.toPlayer.table;
                                dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                                dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsTwo(global.allBots[indexValue].playerCards);
                                Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                            } else if (tabData.data.gameType.evaluateFunc == 'scoreHandsFour') {
                                dataToCheckSSCards.table = data.toPlayer.table;
                                dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                                dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsFour(global.allBots[indexValue].playerCards);
                                Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                            } else if (tabData.data.gameType.evaluateFunc == 'scoreHandsLowest') {
                                dataToCheckSSCards.table = data.toPlayer.table;
                                dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                                dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsLowest(global.allBots[indexValue].playerCards);
                                Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                            } else if (tabData.data.gameType.evaluateFunc == 'scoreHandsJoker') {
                                dataToCheckSSCards.table = data.toPlayer.table;
                                dataToCheckSSCards.accessToken = data.toPlayer.accessToken;
                                dataToCheckSSCards.handNormal = teenPattiScore.scoreHandsJoker(global.allBots[indexValue].playerCards);
                                Bots.checkCardsForSideShow(dataToCheckSSCards, callback);
                            }
                        }
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
        // console.log("data--", data)
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
            }, _.random(2000, 6000));
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
            }, _.random(2000, 6000));
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
            }, _.random(2000, 6000));
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
            }, _.random(2000, 6000));
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
            }, _.random(2000, 6000));
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
            }, _.random(2000, 6000));
        }
    },


    /**
     *  remove player from localDb if connectionLost or interupted
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    removePlayer: function (data) {
        // console.log("removePlayerSocket--+++++++++++++", data);
        var indexValue = _.findIndex(global.allBots, function (o) {
            return _.isEqual(o.botId, data.memberId);
        });
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
                        return x.botId == data.memberId;
                    });
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
                        socket.off("Update_" + data.localTableData.tableId, global.allBots[indexValue].update);
                        socket.off("sideShow_" + data.localTableData.tableId, global.allBots[indexValue].sideShow);
                        socket.off("removePlayer_" + data.localTableData.tableId, global.allBots[indexValue].removePlayer);
                        socket.off("showWinner_" + data.localTableData.tableId, global.allBots[indexValue].showWinner);
                        _.pullAt(global.allBots, indexValue);
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
                    // console.log("getTableInfo", botData);
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
        var tblData = {};
        if (!_.isEmpty(data.botDetails)) {
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

                        // console.log("emptyNumArr.true[0]", emptyNumArr.true[0]);
                        // console.log(" tblData.tableId", tblData.tableId);
                        // console.log("socketId", socketId);
                        // console.log("data.botDetails.accessToken", data.botDetails.accessToken);

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
                            var indexValue = _.findIndex(global.allBots, function (o) {
                                return _.isEqual(o._id, data.botDetails._id);
                            });

                            callback(error, body);

                            // console.log("body", body);
                            // console.log("error", error);

                            if (body.data) {
                                console.log("memberID", body.data.memberId)

                                console.log("tblData.tableId", tblData.tableId)

                                var updateSocket = function (usData) {
                                    var allBotDataToSend = {};
                                    // allBotDataToSend.botsPresent = tblData.bots;
                                    allBotDataToSend.currentBotAdded = body.data;
                                    allBotDataToSend.updatedSocketData = usData.data;
                                    // console.log("body.data.memberId", body.data)
                                    Bots.botGamePlay(body.data.memberId, allBotDataToSend);
                                }
                                socket.on("Update_" + tblData.tableId, updateSocket);

                                //for side show

                                var sideShowSocket = function (data) {
                                    Bots.sideShowLogic(body.data.memberId, data.data);
                                }
                                socket.on("sideShow_" + tblData.tableId, sideShowSocket);

                                //for remove 

                                var removePlayerSocket = function (data) {
                                    Bots.removePlayer(data.data);
                                }
                                socket.on("removePlayer_" + tblData.tableId, removePlayerSocket);

                                //for show winnner

                                var showWinnerSocket = function (data) {
                                    Bots.removeBotAfterShowWinner(data.data);
                                };
                                socket.on("showWinner_" + tblData.tableId, showWinnerSocket);

                                var m = global.allBots[indexValue];
                                m.update = updateSocket;
                                m.sideShow = sideShowSocket;
                                m.removePlayer = removePlayerSocket;
                                m.showWinner = showWinnerSocket;
                                m.blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
                                m.chalCount = 50;
                                m.chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
                                m.chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
                                m.chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
                                m.chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
                                m.chalCountHC = 2;
                                m.lastPotAmount = -1;
                                // console.log("global.allBots[indexValue]", global.allBots[indexValue])
                            }
                        });
                    }
                ],
                callback);
        } else {
            callback()
        }
    },

    removeAllData: function (data, callback) {
        async.waterfall([
                function (callback) {
                    Tables.find({}).deepPopulate('bots').exec(callback);
                },
                function (tableData, callback) {
                    async.eachSeries(tableData, function (n, callback) {
                        async.eachSeries(n.bots, function (m, callback) {
                            Bots.findOne({
                                _id: m._id
                            }).exec(function (err, data1) {
                                var dataToRemove = {};
                                dataToRemove.table = null;
                                dataToRemove._id = data1._id;
                                Bots.saveData(dataToRemove, callback);
                            });
                        }, callback);
                    }, callback);
                },
                function (tbData, callback) {
                    Tables.remove({}).exec(callback);
                }
            ],
            callback);
    }
};

/**
 *  cancel a order.
 * 
 *  @param  {String} id -   specific market symbol.
 *  @returns  {callback} callback -   Return cancel order details.
 */
cron.schedule('*/5 * * * * *', function () {
    console.log("********cron****");
    model.searchForFreeBots();
});


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
    Bots.removeAllData({}, function () {});
});

module.exports = _.assign(module.exports, exports, model);