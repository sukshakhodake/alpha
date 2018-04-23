var cron = require('node-cron');
var socket = require('socket.io-client')('http://teenpatti.kingplay.online');
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
                            botsData.botId = body.data.accessToken[0];
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
                // console.log("tableDataFromApi++++++++++++", tableDataFromApi);
                async.eachLimit(tableDataFromApi, 10, function (n, callback) {
                    // n.actualUsers ==1
                    if (n.actualUsers == 1) {
                        if (n.botCount == 0 || b.botCount == 1) {
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 2) {
                            callback();
                        } else {
                            Bots.removeBotFromTable(n, callback);
                        }
                    } else if (n.actualUsers == 2) {
                        if (n.botCount == 0 || b.botCount == 1) {
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 2) {
                            callback();
                        } else {
                            Bots.removeBotFromTable(n, callback);
                        }
                    } else if (n.actualUsers == 3) {
                        if (n.botCount == 0) {
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 1) {
                            callback();
                        } else {
                            Bots.removeBotFromTable(n, callback);
                        }
                    } else if (n.actualUsers == 4) {
                        if (n.botCount == 0) {
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 1) {
                            callback();
                        } else {
                            Bots.removeBotFromTable(n, callback);
                        }
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
                        "table": {
                            $exists: false
                        }
                    }).exec(callback);
                },
                //add bot to LocalsystmsDbTable
                function (botData, callback) {
                    botsData = botData;
                    accessToken = botsData.userData.accessToken[0];
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
    },


    /**
     *  remove bot from table Data
     * 
     *  @param  {String} table data -   table data.     
     *  @returns  {callback} callback -   Return table Data.
     */
    removeBotFromTable: function (data, callback) {
        var localTableId = {};
        async.waterfall([
                //find a tble from localDb
                function (callback) {
                    Tables.findOne({
                        tableId: data._id
                    }).deepPopulate('bots').exec(callback);
                },
                // remove bots from respective table on server
                function (tabData, callback) {
                    localTableId = tabData;
                    console.log("tabData", tabData);
                    //remove from table
                    async.series(tabData.bots, function (n, callback) {
                        request.post({
                            url: global["env"].testIp + 'Player/deletePlayer',
                            body: {
                                tableId: tabData.tableId,
                                accessToken: n.botId
                            },
                            json: true
                        }, function (error, response, body) {
                            console.log("--------", body);
                            callback(error, body);
                        });
                    }, callback);
                },
                //remove table reference from bot 
                function (botData, callback) {
                    Bots.fineOne({
                        table: localTableId._id
                    }).exec(function (err, data) {
                        var dataToRemove = {};
                        dataToRemove.table = '';
                        dataToRemove._id = data._id;
                        Bots.saveData(dataToRemove, callback);
                    });
                },
                //remove the respective table
                function (botdata, callback) {
                    Tables.delete({
                        _id: localTableId._id
                    }).exec(callback);
                }
            ],
            callback);
    },


    getAllTableInfo: function (data, callback) {
        var dataToSend = {};
        dataToSend.maxRow = 100;
        dataToSend.filter = {
            type: "public"
        };
        request.post({
            url: global["env"].testIp + 'Table/filterTables',
            body: dataToSend,
            json: true
        }, function (error, response, body) {
            callback(error, body);
        });
    },

    updateSocketFunction: function (data, callback) {
        console.log("updateSocketFunction--", data);
    },

    showWinnerFunction: function (data, callback) {
        console.log("showWinnerFunction--", data);
    },

    sideShowSocket: function (data, callback) {
        console.log("sideShowSocket--", data);
    }
};

/**
 *  cancel a order.
 * 
 *  @param  {String} id -   specific market symbol.
 *  @returns  {callback} callback -   Return cancel order details.
 */
// cron.schedule('*/5 * * * *', function () {
//     var options = {
//         method: 'GET',
//         url: "https://192.168.2.40/api/Table/filterTables"
//     };
//     request(options, function (err, response, body) {
//         console.log("body", body)
//     });
// });

socket.on('connect', function () {
    global.socketId = socket.io.engine.id;
});

socket.on("Update", model.updateSocketFunction);

socket.on("showWinner", model.showWinnerFunction);

socket.on("sideShow", model.sideShowSocket);


module.exports = _.assign(module.exports, exports, model);