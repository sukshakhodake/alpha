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
        dataToSend.filter = {};
        request.post({
            url: "http://192.168.1.108:1338/api/Table/filterTables",
            body: dataToSend,
            json: true
        }, function (error, response, body) {
            if (error) {
                callback(error, null);
            } else {
                callback(null, body);
            }
        });
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

module.exports = _.assign(module.exports, exports, model);