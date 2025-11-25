import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';

export const PACKAGE_ID = process.env.NEXT_PUBLIC_SUI_PACKAGE_ID || '0x0';
export const SUI_NETWORK = process.env.NEXT_PUBLIC_SUI_NETWORK || 'testnet';

export const suiClient = new SuiClient({
    url: getFullnodeUrl(SUI_NETWORK as 'testnet' | 'mainnet' | 'devnet' | 'localnet'),
});
