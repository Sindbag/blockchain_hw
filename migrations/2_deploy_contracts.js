var TBGame = artifacts.require("TurnBasedGame");
var XOGameLogicLib = artifacts.require("XOGameLogic");
var XOGame = artifacts.require("XOGame");


module.exports = function(deployer) {
    deployer.deploy(XOGameLogicLib);
    deployer.deploy(TBGame, true);
    // deployer.link(TBGame, XOGame);
    deployer.link(XOGameLogicLib, XOGame);
    deployer.deploy(XOGame, true);
};