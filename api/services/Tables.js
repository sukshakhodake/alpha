var schema = new Schema({
    bots: [{
        type: Schema.Types.ObjectId,
        ref: 'Bots',
        index: true
    }],
    status: {
        type: String,
        enum: ['', '', ''],
        default: ""
    },
    json: Schema.Types.Mixed

});

schema.plugin(deepPopulate, {});
schema.plugin(uniqueValidator);
schema.plugin(timestamps);
module.exports = mongoose.model('Tables', schema);

var exports = _.cloneDeep(require("sails-wohlig-service")(schema));
var model = {};
module.exports = _.assign(module.exports, exports, model);