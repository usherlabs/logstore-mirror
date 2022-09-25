import { SupportedSourcesChains } from '@/types';

// import { DUMMY_ETH_ABI } from './dummy';

/**
 * A function used to format a struct object gotten from the blockchain
 * @param struct {Array} a strut onject directly from the blockchain
 * @returns
 */
export const parseStruct = (struct: [] | {}) => {
	const initialArgs = { ...struct };
	const parsedArgs = Object.create({});
	Object.keys(initialArgs).forEach((key) => {
		if (+key || +key === 0) return; // if the index is a number, it means it is a duplicate key we dont need
		parsedArgs[key] = initialArgs[key].toString();
	});
	return parsedArgs;
};

export const getChainName = (chainId: string | number) => {
	const res = Object.entries(SupportedSourcesChains).find(
		(entry) => entry[1] === chainId
	);
	return res[0] || '';
};

/**
 * A function used to return from 0 to count - 1
 * @param count {number} The uppoer limit of range we want to get
 * @returns {array} returns and array with ordered elements from 0 to count - 1
 */
export const range = (count: number | string) => [...new Array(+count).keys()];


/**
 * A function used to parse a url in the form of IPFS://cid into just cid
 * @param url 
 * @returns 
 */
export function parseIPFSURL(url:string){
    const IPFS_PREFIX = "://";
    return url.split(IPFS_PREFIX)?.[1]
}