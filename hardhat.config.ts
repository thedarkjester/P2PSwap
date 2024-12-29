import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  paths: {
    artifacts: "./build",
  },
  gasReporter: {
    enabled: true,
  },
  solidity: {
    compilers: [
      {
        version: "0.8.26",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
          evmVersion: "cancun",
        },
      },
      {
        version: "0.8.20",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
          viaIR: true,
          evmVersion: "london",
        },
      },
    ],
  },
  sourcify: {
    enabled: true,
  },
  networks: {
    hardhat: {
      hardfork: "cancun",
    },
    localNode: {
      url: "http://127.0.0.1:8545",
    },
    mainnet: {
      url: "https://mainnet.infura.io/v3/" + process.env.INFURA_API_KEY,
    },
    sepolia: {
      url: "https://sepolia.infura.io/v3/" + process.env.INFURA_API_KEY,
    },
    linea_sepolia: {
      url: "https://linea-sepolia.infura.io/v3/" + process.env.INFURA_API_KEY,
    },
    linea_mainnet: {
      url: "https://linea-mainnet.infura.io/v3/" + process.env.INFURA_API_KEY,
    },
  },
  mocha: {
    timeout: 20000,
  },
  etherscan: {
    apiKey: {
      mainnet: process.env.ETHERSCAN_API_KEY ?? "",
      goerli: process.env.ETHERSCAN_API_KEY ?? "",
      sepolia: process.env.ETHERSCAN_API_KEY ?? "",
      linea_sepolia: process.env.LINEASCAN_API_KEY ?? "",
      linea_mainnet: process.env.LINEASCAN_API_KEY ?? "",
    },
    customChains: [
      {
        network: "linea_sepolia",
        chainId: 59141,
        urls: {
          apiURL: "https://api-sepolia.lineascan.build/api",
          browserURL: "https://sepolia.lineascan.build/",
        },
      },
      {
        network: "linea_mainnet",
        chainId: 59144,
        urls: {
          apiURL: "https://api.lineascan.build/api",
          browserURL: "https://lineascan.build/",
        },
      },
    ],
  },
};

export default config;
