require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const AMOY_RPC_URL = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology/";
const rawPrivateKey = process.env.PRIVATE_KEY ? process.env.PRIVATE_KEY.trim() : "";
const formattedPrivateKey = rawPrivateKey.startsWith("0x") ? rawPrivateKey : `0x${rawPrivateKey}`;
const isValidPrivateKey = /^0x[0-9a-fA-F]{64}$/.test(formattedPrivateKey);

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      chainId: 31337,
    },
    amoy: {
      url: AMOY_RPC_URL,
      accounts: isValidPrivateKey ? [formattedPrivateKey] : [],
      chainId: 80002,
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};

