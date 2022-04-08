import { task } from "hardhat/config";

task("mint", "mint token")
    .addParam("contract", "The contract address")
    .addParam("tokenuri", "URI to json")
    .addParam("owner", "owner")
    .setAction(async (taskArgs, hre) => {
        const contract = await hre.ethers.getContractAt(
            "Marketplace",
            taskArgs.contract
        );

        console.log(await contract.createItem(taskArgs.tokenuri, taskArgs.owner));
    });
