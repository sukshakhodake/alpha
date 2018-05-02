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
            function (data, callback) {
                tableDataFromApi = data.data.results;
                // console.log("tableDataFromApi---", tableDataFromApi);
                Tables.find({}).exec(callback);
            },
            // Combine the Data Together to find no of actual users
            function (data, callback) {
                tableDataFromDB = data;
                // console.log("tableDataFromDB---", tableDataFromDB);
                _.each(tableDataFromApi, function (n) {
                    var sameTableFromDB = _.find(tableDataFromDB, function (m) {
                        return m.tableId == n._id;
                    });
                    if (sameTableFromDB) {
                        n.botCount = sameTableFromDB.bots.length;
                        n.actualUsers = n.noOfPlayers - n.botCount;
                    } else {
                        n.botCount = 0;
                        n.actualUsers = n.noOfPlayers;
                    }
                });
                callback();
            },
            // run async eachLimit 10 for adding or removing
            function (data, callback) {
                async.eachSeries(tableDataFromApi, function (n, callback) {
                    // n.actualUsers ==1
                    if (n.actualUsers == 1) {
                        if (n.botCount == 0 || n.botCount == 1) {
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 2) {
                            callback();
                        }
                    } else if (n.actualUsers == 2) {
                        if (n.botCount == 0 || n.botCount == 1) {
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 2) {
                            callback();
                        }
                    } else if (n.actualUsers == 3) {
                        if (n.botCount == 0) {
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 1) {
                            callback();
                        }
                    } else if (n.actualUsers == 4) {
                        if (n.botCount == 0) {
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 1) {
                            callback();
                        }
                    } else if (n.actualUsers == 0) {
                        Bots.removeBotFromEmptyTable(n, callback);
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
                    // console.log("botData", botData)
                    if (botData && botData != null) {
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


    //socket
    showWinnerFunction: function (data, callback) {
        console.log("showWinnerFunction--", data);
        // Bots.removeBotAfterShowWinner(data.data, callback)
    },


    /**
     *  remove bot from table Data after show winner
     * 
     *  @param  {String} table data -   table data.     
     *  @returns  {callback} callback -   Return table Data.
     */
    removeBotAfterShowWinner: function (data, callback) {
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
                    console.log("localTableData", localTableData.bots.length);
                    var botLength = localTableData.bots.length;
                    var playersLength = tabData.data.players.length;
                    var actualPlayerLength = playersLength - botLength;
                    console.log("tabData", tabData.data.players.length)
                    console.log("actualLength", actualPlayerLength)
                    if (actualPlayerLength >= 5 && botLength >= 1) {
                        Bots.deleteBot(localTableData, callback)
                    } else if (actualPlayerLength == 4 && botLength > 1) {
                        _.pullAt(localTableData.bots, 0);
                        Bots.deleteBot(localTableData, callback)
                    } else if (actualPlayerLength == 3 && botLength > 1) {
                        // _.pullAt(localTableData.bots, 0);
                        Bots.deleteBot(localTableData, callback)
                    } else if (actualPlayerLength == 2 && botLength == 1) {
                        // _.pullAt(localTableData.bots, [0, 1]);
                        console.log("(((((((((((()))))))))))))))))))");
                        Bots.deleteBot(localTableData, callback)
                    } else if (actualPlayerLength == 1) {
                        // _.pullAt(localTableData.bots, [0, 1]);
                        // Bots.deleteBot(localTableData, callback)
                        console.log("(((((((((((()))))))))))))))))))");
                        Bots.deleteBot(localTableData, callback)
                    } else {
                        callback()
                    }
                }
            ],
            callback);
    },

    deleteBot: function (data, callback) {
        async.eachSeries(data.bots, function (n, callback) {
            console.log("data.tableId", data.tableId);
            console.log("n.accessToken", n.accessToken)
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
                            console.log("-----body-------", body);
                            console.log("----error--------", error);
                            // console.log("-------response-----", response);
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
    updateSocketFunction: function (data, callback) {
        Bots.botGamePlay(data.data, callback);
    },


    /**
     *  bot gameplay 
     * 
     *  @param  {String} socket data -   socket data.     
     *  @returns  {callback} callback -   Return game data.
     */
    botGamePlay: function (data, callback) {
        if (data.extra.serve || data.extra.newGame) {
            blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
            chalCount = 50;
            chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
            chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
            chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
            chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
            chalCountHC = 1;
        } else {
            async.waterfall([
                    function (callback) {
                        Bots.find({}, callback);
                    },
                    function (botsData, callback) {
                        var dataForSeenCards = {};
                        var dataToChaal = {};
                        var blindStatus = _.find(data.players, function (m) {
                            return m.isBlind == false;
                        });
                        async.eachSeries(data.players, function (n, callback) {
                            var existingBot = _.find(botsData, function (m) {
                                return m.botId == n.memberId;
                            });
                            if (existingBot) {
                                var existingBotInSocket = _.find(data.players, function (m) {
                                    return m.memberId == existingBot.botId;
                                });
                                if (existingBotInSocket.isTurn == true) {
                                    // console.log("existingBotInSocket", existingBotInSocket);
                                    // var blindCount = Math.floor(Math.random() * (10 - 3 + 1)) + 3;
                                    console.log("blindCount", blindCount);
                                    if (_.isEmpty(blindStatus)) {
                                        if (blindCount > 0) {
                                            setTimeout(function () {
                                                request.post({
                                                    url: global["env"].testIp + 'Player/chaal',
                                                    body: {
                                                        tableId: existingBotInSocket.table,
                                                        accessToken: existingBot.accessToken,
                                                        amount: data.minAmt
                                                    },
                                                    json: true
                                                }, function (error, response, body) {
                                                    blindCount--;
                                                    console.log("blindCount", blindCount);
                                                    console.log("body>>>>>>>--", body);
                                                    callback(error, body);
                                                });
                                            }, 3000);
                                        } else {
                                            request.post({
                                                url: global["env"].testIp + 'Player/makeSeen',
                                                body: {
                                                    tableId: existingBotInSocket.table,
                                                    accessToken: existingBot.accessToken,
                                                },
                                                json: true
                                            }, function (error, response, body) {
                                                callback(error, body);
                                            });
                                        }
                                    } else {
                                        // console.log("existingBotInSocket@@@@@@@@@@@@", existingBotInSocket);
                                        if (existingBotInSocket.isBlind == true) {
                                            request.post({
                                                url: global["env"].testIp + 'Player/makeSeen',
                                                body: {
                                                    tableId: existingBotInSocket.table,
                                                    accessToken: existingBot.accessToken,
                                                },
                                                json: true
                                            }, function (error, response, body) {
                                                callback(error, body);
                                            });
                                        } else {
                                            var dataToCheckCards = {};
                                            if (data.gameType.evaluateFunc == 'scoreHandsNormal') {
                                                dataToCheckCards.type = 'scoreHandsNormal';
                                                dataToCheckCards.botData = existingBotInSocket;
                                                dataToCheckCards.minAmt = data.minAmt;
                                                dataToCheckCards.maxAmt = data.maxAmt;
                                                dataToCheckCards.accessToken = existingBot.accessToken;
                                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsNormal(existingBotInSocket.cards);
                                                Bots.checkCards(dataToCheckCards, callback);
                                            } else if (data.gameType.evaluateFunc == 'scoreHandsTwo') {
                                                dataToCheckCards.botData = existingBotInSocket;
                                                dataToCheckCards.minAmt = data.minAmt;
                                                dataToCheckCards.maxAmt = data.maxAmt;
                                                dataToCheckCards.accessToken = existingBot.accessToken;
                                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsTwo(existingBotInSocket.cards);
                                                Bots.checkCards(dataToCheckCards, callback);
                                            } else if (data.gameType.evaluateFunc == 'scoreHandsFour') {
                                                dataToCheckCards.botData = existingBotInSocket;
                                                dataToCheckCards.minAmt = data.minAmt;
                                                dataToCheckCards.maxAmt = data.maxAmt;
                                                dataToCheckCards.accessToken = existingBot.accessToken;
                                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsFour(existingBotInSocket.cards);
                                                Bots.checkCards(dataToCheckCards, callback);
                                            } else if (data.gameType.evaluateFunc == 'scoreHandsLowest') {
                                                dataToCheckCards.botData = existingBotInSocket;
                                                dataToCheckCards.minAmt = data.minAmt;
                                                dataToCheckCards.maxAmt = data.maxAmt;
                                                dataToCheckCards.accessToken = existingBot.accessToken;
                                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsLowest(existingBotInSocket.cards);
                                                Bots.checkCards(dataToCheckCards, callback);
                                            } else if (data.gameType.evaluateFunc == 'scoreHandsJoker') {
                                                dataToCheckCards.botData = existingBotInSocket;
                                                dataToCheckCards.minAmt = data.minAmt;
                                                dataToCheckCards.maxAmt = data.maxAmt;
                                                dataToCheckCards.accessToken = existingBot.accessToken;
                                                dataToCheckCards.handNormal = teenPattiScore.scoreHandsJoker(existingBotInSocket.cards);
                                                Bots.checkCards(dataToCheckCards, callback);
                                            }
                                        }
                                    }
                                }
                            } else {
                                callback();
                            }
                        }, callback);
                    }
                ],
                callback);
        }
    },

    /**
     *  match cards types
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    checkCards: function (data, callback) {
        console.log("data--", data)
        if (data.handNormal.name == 'Trio') {
            if (chalCount > 0) {
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
                        chalCount--;
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
                        chalCount = 50;
                        console.log("chalCount", chalCount);
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'Pure Sequence') {
            // chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
            if (chalCountPS > 0) {
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
                        chalCountPS--;
                        console.log("chalCountPS", chalCountPS);
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
                        chalCountPS = Math.floor(Math.random() * (12 - 8 + 1)) + 8;
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'Sequence') {
            // chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
            if (chalCountS > 0) {
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
                        chalCountS--;
                        console.log("chalCountS", chalCountS);
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
                        chalCountS = Math.floor(Math.random() * (8 - 5 + 1)) + 5;
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'Color') {
            // chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
            if (chalCountC > 0) {
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
                        chalCountC--;
                        console.log("chalCountC", chalCountC);
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
                        chalCountC = Math.floor(Math.random() * (5 - 3 + 1)) + 3;
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'Pair') {
            // chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
            if (chalCountP > 0) {
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
                        chalCountP--;
                        console.log("chalCountP", chalCountP);
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
                        chalCountP = Math.floor(Math.random() * (4 - 2 + 1)) + 2;
                        callback(error, body);
                    });
                }, 3000);
            }
        } else if (data.handNormal.name == 'High Card') {
            // chalCountHC = Math.floor(Math.random() * (1 - 0 + 1)) + 1;
            if (chalCountHC > 0) {
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
                        chalCountHC--;
                        console.log("chalCountHC", chalCountHC);
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
                        chalCountHC = 1;
                        callback(error, body);
                    });
                }, 3000);
            }
        }
    },


    //socket
    sideShowSocket: function (data, callback) {
        // console.log("sideShowSocket--", data);
        Bots.sideShowLogic(data.data, callback);
    },

    /**
     *  side show logic
     * 
     *  @param  {String} bot  data -   bot gameplay data.     
     *  @returns  {callback} callback -   Return card data.
     */
    sideShowLogic: function (data, callback) {
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
            callback);
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
};

/**
 *  cancel a order.
 * 
 *  @param  {String} id -   specific market symbol.
 *  @returns  {callback} callback -   Return cancel order details.
 */
cron.schedule('*/5 * * * * *', function () {
    console.log("-")
    model.getTableInfo();
});

socket.on('connect', function () {
    global.socketId = socket.io.engine.id;
});

socket.on("Update", model.updateSocketFunction);

socket.on("showWinner", model.showWinnerFunction);

socket.on("sideShow", model.sideShowSocket);


module.exports = _.assign(module.exports, exports, model);