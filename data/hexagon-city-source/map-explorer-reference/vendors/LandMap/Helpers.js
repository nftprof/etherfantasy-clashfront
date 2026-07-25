import {sizeMapper, tokenMapper} from "./Defaults/Defaults";

/**
 * Padd the tokenId
 * @param param
 * @returns
 */
export const padTokenIdL3 = ({ l2Id: l2Id, l3Id: l3Id, zone: zone, size: size }) => {
    return sizeMapper[size] + tokenMapper[zone] + String(l2Id).padStart(4, '0') + String(l3Id).padStart(4, '0');
}


/**
 * Padd the tokenId
 * @param param
 * @returns
 */
export const padTokenId = ({ tokenId: tokenId, type: type, zone: zone}) => {
    return sizeMapper[type] + tokenMapper[zone] + String(tokenId).padStart(4, '0');
}