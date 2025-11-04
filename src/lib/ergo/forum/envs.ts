export const network_id: "mainnet"|"testnet" = "mainnet";
export const explorer_uri =          (network_id == "mainnet") ? "https://api.ergoplatform.com"          : "https://api-testnet.ergoplatform.com";
export const web_explorer_uri_tx =   (network_id == "mainnet") ? "https://sigmaspace.io/en/transaction/" : "https://testnet.ergoplatform.com/transactions/";
export const web_explorer_uri_addr = (network_id == "mainnet") ? "https://sigmaspace.io/en/address/"     : "https://testnet.ergoplatform.com/addresses/";
export const web_explorer_uri_tkn = (network_id == "mainnet") ? "https://sigmaspace.io/en/token/"        : "https://testnet.ergoplatform.com/tokens/";

export const PROFILE_TYPE_NFT_ID = "1820fd428a0b92d61ce3f86cd98240fdeeee8a392900f0b19a2e017d66f79926";
export const DISCUSSION_TYPE_NFT_ID = "273f60541e8869216ee6aed5552e522d9bea29a69d88e567d089dc834da227cf";
export const COMMENT_TYPE_NFT_ID = "6c1ec833dc4aff98458b60e278fc9a0161274671d6a0c36a7429216ca99c3267";
export const SPAM_FLAG_NFT_ID = "89505ed416ad43f2dc4b3c8d0eb949e6ba9993436ceb154a58645f1484e1437a";
export const PROFILE_TOTAL_SUPPLY = 99999999;
export const SPAM_LIMIT = 0;