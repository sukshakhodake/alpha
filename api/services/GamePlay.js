var schema = new Schema({
    bots: {
        type: Schema.Types.ObjectId,
        ref: 'Bots',
        index: true
    },
    blindCount: Number,
    chalCount: Number,
    maxBlindCount: Number,
    maxChalCount: Number,
    gameScore: Number,
    status: {
        type: String,
        enum: ['Blind', 'Seen'],
        default: "Blind"
    },
    winningStatus: {
        type: String,
        enum: ['', ''],
        default: ""
    },
    commissionAmount: Number,
    amountAdded: Number,
    amountWon: Number,
    amountLost: Number,
    balance: Number
});

schema.plugin(deepPopulate, {});
schema.plugin(uniqueValidator);
schema.plugin(timestamps);
module.exports = mongoose.model('GamePlay', schema);

var exports = _.cloneDeep(require("sails-wohlig-service")(schema));
var model = {};
module.exports = _.assign(module.exports, exports, model);