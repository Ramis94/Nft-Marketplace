pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "./tokens/MyERC721.sol";
import "hardhat/console.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract Marketplace {

    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    MyERC721 private nft;
    IERC20 private buyToken;

    uint256 timeAuction;
    uint16 minNumberOfBets;

    mapping(uint256 => TokenInfo) public tokensWithEntity;
    mapping(uint256 => SaleEntity) public tokenInSale;
    mapping(uint256 => AuctionEntity) public tokenInAuction;

    struct TokenInfo {
        uint256 tokenId;
        address owner;
    }

    struct SaleEntity {
        address owner;
        uint256 price;
    }

    struct AuctionEntity {
        address owner;
        uint256 price;
        uint256 timer;
        uint16 auctionCount;
        address lastPutUser;
    }

    constructor(address _nft, address _buyToken) {
        nft = MyERC721(_nft);
        buyToken = IERC20(_buyToken);
        timeAuction = 10 minutes;
        minNumberOfBets = 2;
    }

    //пользователю минтится nft
    //вызываем минт у нфт
    //должна создаваться структура или маппинг, должны учитываться токенId чтобы они не повторялись, tokenURI предоставляет сам создатель
    function createItem(string memory tokenURI, address owner) public {
        uint256 tokenId = nft.mint(tokenURI, owner);
        tokensWithEntity[tokenId] = TokenInfo(tokenId, owner);
    }

    /*
    listItem(tokenId, price) - функция смарт контракта маркетплейса для выставления NFTна продажу
    на время листинга NFT отправляется на смарт контракт маркетплейса
    */
    function listItem(uint256 tokenId, uint256 price) public {
        require(tokenInSale[tokenId].owner == address(0), "Marketplace: token already sale");
        require(tokenInAuction[tokenId].owner == address(0), "Marketplace: token already on auction");
        nft.transferFrom(msg.sender, address(this), tokenId);
        tokenInSale[tokenId] = SaleEntity(msg.sender, price);
    }

    //buyItem(tokenId) - функция для покупки NFT; с пользователя вызвавшего функцию списываются токены, взамен ему отправляется NFT
    function buyItem(uint256 tokenId) public {
        require(tokenInSale[tokenId].owner != address(0), "Marketplace: token is not sale");
        SaleEntity storage saleEntity = tokenInSale[tokenId];
        nft.transferFrom(address(this), msg.sender, tokenId);
        buyToken.transferFrom(msg.sender, saleEntity.owner, saleEntity.price);
        delete tokenInSale[tokenId];
    }

    //функция для отмены продажи NFT, может быть вызвана до тех пор пока не вызвана функция buyItem
    function cancel(uint256 tokenId) public {
        SaleEntity storage entity = tokenInSale[tokenId];
        require(entity.owner != address(0), "Marketplace: token is not sale");
        require(entity.owner == msg.sender, "Marketplace: error cancel. Owner not equals sender");
        nft.transferFrom(address(this), entity.owner, tokenId);
        delete tokenInSale[tokenId];
    }

    //listItemOnAuction(tokenId, minPrice) - функция смарт контракта маркетплейса для выставления токена на продажу на аукционе
    //на время проведения аукциона токен отправляется на смарт контракт маркетплейса
    function listItemOnAuction(uint256 tokenId, uint256 minPrice) public {
        TokenInfo storage entity = tokensWithEntity[tokenId];
        require(tokenInAuction[tokenId].owner == address(0), "Marketplace: token already on auction");
        require(tokenInSale[tokenId].owner == address(0), "Marketplace: token already sale");
        nft.transferFrom(msg.sender, address(this), tokenId);
        tokenInAuction[tokenId] = AuctionEntity(msg.sender, minPrice, block.timestamp + timeAuction, 0, address(0));
    }

    //makeBid(tokenId, price) - функция для повышения ставки для лота с определенным tokenId;
    //с пользователя вызвавшего функцию списываются токены и замораживаются на смарт контракте;
    //если ставка не первая, то предыдущему пользователю возвращаются его замороженные токены
    function makeBid(uint256 tokenId, uint256 price) public {
        AuctionEntity storage entity = tokenInAuction[tokenId];
        require(entity.owner != address(0), "Marketplace: token not found on auction");
        require(entity.price <= price, "Marketplace: price is small");
        buyToken.transferFrom(msg.sender, address(this), price);
        if (entity.lastPutUser != address(0)) {
            buyToken.transfer(entity.lastPutUser, entity.price);
        }
        entity.price = price;
        entity.lastPutUser = msg.sender;
        entity.auctionCount++;
    }

    //finishAuction (tokenId) - функция для завершения аукциона; NFT отправляется последнему биддеру, а токены отправляются продавцу
    //по прошествии определенного времени функцию может вызвать любой пользователь
    //если <=minItemOnAuction ставок, то аукцион отменяется
    function finishAuction(uint256 tokenId) public {
        require(tokenInAuction[tokenId].owner != address(0), "Marketplace: token not found on auction");
        AuctionEntity storage entity = tokenInAuction[tokenId];
        require(block.timestamp > entity.timer, "Marketplace: no time has passed");
        if (entity.auctionCount <= minNumberOfBets) {
            nft.transferFrom(address(this), entity.owner, tokenId);
            buyToken.transfer(entity.lastPutUser, entity.price);
            delete tokenInAuction[tokenId];
        } else {
            nft.transferFrom(address(this), entity.lastPutUser, tokenId);
            buyToken.transfer(entity.owner, entity.price);
            delete tokenInAuction[tokenId];
        }
    }

    //минимальное количество ставок для аукциона
    function setMinNumberOfBets(uint16 _minNumberOfBets) public {
        minNumberOfBets = _minNumberOfBets;
    }

    //время аукциона
    function setTimeAuction(uint256 _time) public {
        timeAuction = _time;
    }

    //покупка осуществляется за определенный контракт
    function setBuyContract(address token) public {
        buyToken = IERC20(token);
    }
}
