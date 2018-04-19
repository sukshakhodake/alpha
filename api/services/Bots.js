var schema = new Schema({
    name: String,
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
    amountWon: Number,
    amountLost: Number,
    amountToPlay: Number,
    username: String,
    password: String
});

schema.plugin(deepPopulate, {});
schema.plugin(uniqueValidator);
schema.plugin(timestamps);
module.exports = mongoose.model('Bots', schema);

var exports = _.cloneDeep(require("sails-wohlig-service")(schema));
var model = {};
module.exports = _.assign(module.exports, exports, model);