module.exports = {
    networks: {
        development: {
            host: "127.0.0.1",
            port: 7545,
            network_id: "*", // Match any network id
            gasPrice: 0,
            gas: 10000000,
        }
    }
};