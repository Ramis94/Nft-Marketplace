import { ethers } from "hardhat";

// 0x17ee91425a7455f1CA391F339bF2A96eb2390cFE
async function main() {
  const MarketplaceFactory = await ethers.getContractFactory("Marketplace");
  const marketplace = await MarketplaceFactory.deploy('0xaeFD1E519DceA5238dC7C103CA31d1928129f188', '0x4E0135662390e9B411A192F914798a07A8074Cc9');

  await marketplace.deployed();

  console.log("Marketplace deployed to:", marketplace.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
