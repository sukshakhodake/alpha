var cron = require('node-cron');
var schema = new Schema({
    id: String,
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
                            botsData.balance = body.data.balanceUp;
                            botsData.id = body.data._id;
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
                    url: global["env"].getTableDataApi,
                    body: dataToSend,
                    json: true
                }, function (error, response, body) {
                    callback(error, body);
                });
            },
            // Get Tables Bots Details from Database
            function (data, callback) {
                tableDataFromApi = data.data.results;
                console.log("tableDataFromApi---", tableDataFromApi);
                Tables.find({}).exec(callback);
            },
            // Combine the Data Together to find no of actual users
            function (data, callback) {
                tableDataFromDB = data;
                console.log("tableDataFromDB---", tableDataFromDB);
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
                console.log("tableDataFromApi++++++++++++", tableDataFromApi);
                async.eachLimit(tableDataFromApi, 10, function (n, callback) {
                    // n.actualUsers ==1
                    if (n.actualUsers == 1) {
                        if (n.botCount == 0 || b.botCount == 1) {
                            // AddBot(callback);
                            Bots.addBotToTable(n, callback);
                        } else if (n.botCount == 2) {
                            callback();
                        } else {
                            // removeBot(callback);
                        }
                    }
                    //  else if (n.actualUsers == 2) {
                    //     if (n.botCount == 0 || b.botCount == 1) {
                    //         // AddBot(callback);
                    //     } else if (n.botCount == 2) {
                    //         callback();
                    //     } else {
                    //         // removeBot(callback);
                    //     }
                    // } else if (n.actualUsers == 3) {
                    //     if (n.botCount == 0) {
                    //         // AddBot(callback);
                    //     } else if (n.botCount == 1) {
                    //         callback();
                    //     } else {
                    //         // removeBot(callback);
                    //     }
                    // } else if (n.actualUsers == 4) {
                    //     if (n.botCount == 0) {
                    //         // AddBot(callback);
                    //     } else if (n.botCount == 1) {
                    //         callback();
                    //     } else {
                    //         // removeBot(callback);
                    //     }
                    // }
                }, callback)
            }
        ], callback);
    },

    addBotToTable: function (data, callback) {
        console.log("addBotToTable!!", data)
        var botsData = {};
        async.waterfall([
                function (callback) {
                    Bots.findOne({
                        "table": {
                            $exists: false
                        }
                    }).exec(callback);
                },
                function (botData, callback) {
                    botsData = botData;
                    var tableDataToSave = {};
                    tableDataToSave.tableId = data._id;
                    tableDataToSave.json = data;
                    tableDataToSave.bots = [];
                    tableDataToSave.bots.push(botData._id);
                    tableDataToSave.status = "InUse";
                    Tables.saveData(tableDataToSave, callback);
                },
                function (tabData, callback) {
                    console.log("tabData", tabData);
                    console.log("botsData", botsData);
                    botsData[0].table = tabData._id;
                    Bots.saveData(botsData, callback);
                },
                function (finalData, callback) {

                }
            ],
            callback);
    },

    removeBotFromTable: function (data, callback) {
        async.waterfall([
                function (callback) {
                    Tables.find({
                        tableId: data._id
                    }).exec(callback);
                },
                function (tabData, callback) {

                },
                function (botData, callback) {

                },
                function (botdata, callback) {

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
// cron.schedule('*/5 * * * *', function () {
//     var options = {
//         method: 'GET',
//         url: "https://192.168.2.40/api/Table/filterTables"
//     };
//     request(options, function (err, response, body) {
//         console.log("body", body)
//     });
// });

var socket = require('socket.io-client')('http://192.168.1.108:1338');
socket.on('connect', function () {
    console.log("socket-", typeof (socket));
});


module.exports = _.assign(module.exports, exports, model);