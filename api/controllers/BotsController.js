module.exports = _.cloneDeep(require("sails-wohlig-controller"));
var controller = {
    checkUser: function (req, res) {
        if (req.body) {
            Bots.checkUser(req.body, res.callback);
        } else {
            res.json({
                value: false,
                data: {
                    message: "Invalid Request"
                }
            })
        }
    },

    getTableInfo: function (req, res) {
        if (req.body) {
            Bots.getTableInfo(req.body, res.callback);
        } else {
            res.json({
                value: false,
                data: {
                    message: "Invalid Request"
                }
            })
        }
    },

    addBotToTable: function (req, res) {
        if (req.body) {
            Bots.addBotToTable(req.body, res.callback);
        } else {
            res.json({
                value: false,
                data: {
                    message: "Invalid Request"
                }
            });
        }
    },

    addSingleBotToTable: function (req, res) {
        if (req.body) {
            Bots.addSingleBotToTable(req.body, res.callback);
        } else {
            res.json({
                value: false,
                data: {
                    message: "Invalid Request"
                }
            })
        }
    },

    searchForFreeBots: function (req, res) {
        if (req.body) {
            Bots.searchForFreeBots(req.body, res.callback);
        } else {
            res.json({
                value: false,
                data: {
                    message: "Invalid Request"
                }
            })
        }
    },

    getAllTableInfo: function (req, res) {
        if (req.body) {
            Bots.getAllTableInfo(req.body, res.callback);
        } else {
            res.json({
                value: false,
                data: {
                    message: "Invalid Request"
                }
            })
        }
    },

    removeBotFromTable: function (req, res) {
        if (req.body) {
            Bots.removeBotFromTable(req.body, res.callback);
        } else {
            res.json({
                value: false,
                data: {
                    message: "Invalid Request"
                }
            })
        }
    },

    removeAllData: function (req, res) {
        if (req.body) {
            Bots.removeAllData(req.body, res.callback);
        } else {
            res.json({
                value: false,
                data: {
                    message: "Invalid Request"
                }
            })
        }
    },
};
module.exports = _.assign(module.exports, controller);