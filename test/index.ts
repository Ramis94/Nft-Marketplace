import {expect} from "chai";
import {ethers} from "hardhat";
import {SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";
import {Marketplace__factory, MyERC721, LPMock, Marketplace, MyERC721__factory, LPMock__factory} from "../typechain";
import {describe} from "mocha";

describe("Marketplace", function () {
    let erc721: MyERC721;
    let lpMockToken: LPMock;
    let marketplace: Marketplace;
    let owner: SignerWithAddress;
    let addr1: SignerWithAddress;
    let addr2: SignerWithAddress;

    beforeEach(async function () {
        [owner, addr1, addr2] = await ethers.getSigners();

        const ERC721Factory = (await ethers.getContractFactory(
            "MyERC721",
            owner
        )) as MyERC721__factory;
        erc721 = await ERC721Factory.deploy(
            "Mock721", "M721"
        );
        await erc721.deployed;

        const LPMockContractFactory = (await ethers.getContractFactory(
            "LPMock",
            owner
        )) as LPMock__factory;
        lpMockToken = await LPMockContractFactory.deploy("LP", "LP");
        await lpMockToken.deployed();


        Promise.all([
            lpMockToken.mint(owner.address, ethers.utils.parseEther("120")),
            lpMockToken.mint(addr1.address, ethers.utils.parseEther("230")),
            lpMockToken.mint(addr2.address, ethers.utils.parseEther("230")),
        ]);

        const MarketplaceFactory = (await ethers.getContractFactory(
            "Marketplace",
            owner
        )) as Marketplace__factory;
        marketplace = await MarketplaceFactory.deploy(
            erc721.address, lpMockToken.address
        );
        await marketplace.deployed;
    });

    describe("Sale", function () {
        it('create & buy', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await erc721.approve(marketplace.address, 1);
            await expect(marketplace.connect(owner).listItem(1, ethers.utils.parseEther("0.1"))).to.ok;
            await lpMockToken.connect(addr1).approve(marketplace.address, ethers.utils.parseEther("0.1"));
            await expect(await marketplace.connect(addr1).buyItem(1)).to.ok;
            await expect(await erc721.balanceOf(addr1.address)).to.equal(1);
        });

        it('buy without listItem', async function () {
            await expect(marketplace.connect(addr1).buyItem(56)).to.be.revertedWith("Marketplace: token is not sale");
        });

        it('listItem with cancel', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await expect(await erc721.balanceOf(owner.address)).to.equal(1);
            await erc721.approve(marketplace.address, 1);
            await expect(await marketplace.connect(owner).listItem(1, ethers.utils.parseEther("0.1"))).to.ok;
            await expect(await erc721.balanceOf(owner.address)).to.equal(0);
            await expect(await erc721.balanceOf(marketplace.address)).to.equal(1);
            await expect(await marketplace.connect(owner).cancel(1)).to.ok;
            await expect(await erc721.balanceOf(owner.address)).to.equal(1);
        });

        it('if canceled by another user', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await erc721.approve(marketplace.address, 1);
            await expect(await marketplace.connect(owner).listItem(1, ethers.utils.parseEther("0.1"))).to.ok;
            await expect(marketplace.connect(addr1).cancel(1)).to.be.revertedWith("Marketplace: error cancel. Owner not equals sender");
        });

        it('token already sale', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await erc721.approve(marketplace.address, 1);
            await expect(await marketplace.connect(owner).listItem(1, ethers.utils.parseEther("0.1"))).to.ok;
            await expect(marketplace.connect(owner).listItem(1, ethers.utils.parseEther("0.2"))).to.be.revertedWith("Marketplace: token already sale");
        });

        it('token already on auction', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await erc721.approve(marketplace.address, 1);
            await expect(await marketplace.connect(owner).listItemOnAuction(1, ethers.utils.parseEther("0.1"))).to.ok;
            await expect(marketplace.connect(owner).listItem(1, ethers.utils.parseEther("0.2"))).to.be.revertedWith("Marketplace: token already on auction");
        });

        it('cancel if token is not sale', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await erc721.approve(marketplace.address, 1);
            await expect(marketplace.connect(owner).cancel(1)).to.be.revertedWith("Marketplace: token is not sale");
        });
    });

    describe("Auction", function () {
        async function createItemWithCheckBalanceAndTransferToMarketplace() {
            expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            expect(await (erc721.balanceOf(owner.address))).to.equal(1);
            expect(await (erc721.balanceOf(marketplace.address))).to.equal(0);
            await erc721.connect(owner).approve(marketplace.address, 1);
            await marketplace.connect(owner).listItemOnAuction(1, 10);
            expect(await (erc721.balanceOf(owner.address))).to.equal(0);
            expect(await (erc721.balanceOf(marketplace.address))).to.equal(1);
        }

        it('test auction', async function () {
            await createItemWithCheckBalanceAndTransferToMarketplace();
            await lpMockToken.connect(addr1).approve(marketplace.address, 1000);
            await lpMockToken.connect(addr2).approve(marketplace.address, 1000);
            await marketplace.connect(addr1).makeBid(1, 11);
            await marketplace.connect(addr2).makeBid(1, 12);
            await ethers.provider.send("evm_increaseTime", [600])
            await marketplace.connect(addr1).makeBid(1, 15);
            await expect(await marketplace.finishAuction(1)).to.ok;
            expect(await (erc721.balanceOf(marketplace.address))).to.equal(0);
            expect(await (erc721.balanceOf(addr1.address))).to.equal(1);
        });

        it('if no time has passed', async function () {
            await createItemWithCheckBalanceAndTransferToMarketplace();
            await expect(marketplace.finishAuction(1)).to.be.revertedWith("Marketplace: no time has passed");
        });

        it('should time has passed and min number of bets is 3', async function () {
            expect(marketplace.setMinNumberOfBets(3)).to.ok;
            await createItemWithCheckBalanceAndTransferToMarketplace();
            await lpMockToken.connect(addr1).approve(marketplace.address, 1000);
            await lpMockToken.connect(addr2).approve(marketplace.address, 1000);
            await marketplace.connect(addr1).makeBid(1, 11);
            await marketplace.connect(addr2).makeBid(1, 12);
            await ethers.provider.send("evm_increaseTime", [600])
            await marketplace.connect(addr1).makeBid(1, 15);
            await expect(await marketplace.finishAuction(1)).to.ok;
            expect(await (erc721.balanceOf(owner.address))).to.equal(1);
        });

        it('should tokens revert to last user', async function () {
            const addr1BalanceBefore = await lpMockToken.balanceOf(addr1.address);
            await createItemWithCheckBalanceAndTransferToMarketplace();
            await lpMockToken.connect(addr1).approve(marketplace.address, 1000);
            await lpMockToken.connect(addr2).approve(marketplace.address, 1000);
            var addr1Bid = 11;
            await marketplace.connect(addr1).makeBid(1, addr1Bid);
            expect(await lpMockToken.balanceOf(addr1.address)).to.equal(addr1BalanceBefore.sub(addr1Bid));
            await marketplace.connect(addr2).makeBid(1, 12);
            expect(await lpMockToken.balanceOf(addr1.address)).to.equal(addr1BalanceBefore);
        });

        it('token already sale', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await erc721.connect(owner).approve(marketplace.address, 1);
            await expect(await marketplace.connect(owner).listItem(1, ethers.utils.parseEther("0.1"))).to.ok;
            await expect(marketplace.connect(owner).listItemOnAuction(1, ethers.utils.parseEther("0.2"))).to.be.revertedWith("Marketplace: token already sale");
        });

        it('token already on auction', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await erc721.connect(owner).approve(marketplace.address, 1);
            await expect(await marketplace.connect(owner).listItemOnAuction(1, ethers.utils.parseEther("0.1"))).to.ok;
            await expect(marketplace.connect(owner).listItemOnAuction(1, ethers.utils.parseEther("0.2"))).to.be.revertedWith("Marketplace: token already on auction");
        });

        it('finish if token not found on auction', async function () {
            await expect(marketplace.connect(owner).finishAuction(1)).to.be.revertedWith("Marketplace: token not found on auction");
        });

        it('makeBid if token not found on auction', async function () {
            await expect(marketplace.connect(owner).makeBid(1, 123)).to.be.revertedWith("Marketplace: token not found on auction");
        });

        it('makeBid if price is less', async function () {
            await expect(marketplace.connect(owner).createItem("qwerty0", owner.address)).to.ok;
            await erc721.connect(owner).approve(marketplace.address, 1);
            await expect(await marketplace.connect(owner).listItemOnAuction(1, ethers.utils.parseEther("0.1"))).to.ok;
            await expect(marketplace.connect(addr1).makeBid(1, 123)).to.be.revertedWith("Marketplace: price is small");
        });
    });

    describe("test other methods", function () {
        it('setMinNumberOfBets ', function () {
            expect(marketplace.setMinNumberOfBets(3)).to.ok;
        });

        it('setTimeAuction', function () {
            expect(marketplace.setTimeAuction(123)).to.ok;
        });

        it('setBuyContract', async function () {
            const LPMockContractFactory = (await ethers.getContractFactory(
                "LPMock",
                owner
            )) as LPMock__factory;
            const lpMockToken = await LPMockContractFactory.deploy("LP1", "LP1");
            await lpMockToken.deployed();
            expect(marketplace.setBuyContract(lpMockToken.address)).to.ok;
        });
    });
});
