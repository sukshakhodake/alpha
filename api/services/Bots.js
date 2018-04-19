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
    password: String
});

schema.plugin(deepPopulate, {});
schema.plugin(uniqueValidator);
schema.plugin(timestamps);
module.exports = mongoose.model('Bots', schema);

var exports = _.cloneDeep(require("sails-wohlig-service")(schema));
var model = {};

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
//         if (err) {
//             console.log(err);
//         } else {
//             btcPrice = JSON.parse(body).last;
//         }
//         callback(err);
//     });
// });

module.exports = _.assign(module.exports, exports, model);