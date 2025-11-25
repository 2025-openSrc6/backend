import axios from 'axios';

const PINATA_API_KEY = process.env.PINATA_API_KEY!;
const PINATA_SECRET_KEY = process.env.PINATA_SECRET_KEY!;
const PINATA_JWT = process.env.PINATA_JWT!;

/**
 * Pinata에 JSON 메타데이터 업로드
 */
export async function uploadMetadataToPinata(metadata: {
    name: string;
    description: string;
    image: string; // IPFS 이미지 URL
    attributes: Array<{ trait_type: string; value: string | number }>;
}) {
    try {
        const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinJSONToIPFS',
            metadata,
            {
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${PINATA_JWT}`,
                },
            }
        );

        return {
            ipfsHash: response.data.IpfsHash,
            ipfsUrl: `ipfs://${response.data.IpfsHash}`,
            gatewayUrl: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
        };
    } catch (error) {
        console.error('Pinata 업로드 실패:', error);
        throw new Error('메타데이터 업로드 실패');
    }
}

/**
 * Pinata에 이미지 파일 업로드
 */
export async function uploadImageToPinata(imageBuffer: Buffer, filename: string) {
    const FormData = require('form-data');
    const formData = new FormData();

    formData.append('file', imageBuffer, filename);

    try {
        const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            formData,
            {
                headers: {
                    ...formData.getHeaders(),
                    Authorization: `Bearer ${PINATA_JWT}`,
                },
            }
        );

        return {
            ipfsHash: response.data.IpfsHash,
            ipfsUrl: `ipfs://${response.data.IpfsHash}`,
            gatewayUrl: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`,
        };
    } catch (error) {
        console.error('Pinata 이미지 업로드 실패:', error);
        throw new Error('이미지 업로드 실패');
    }
}
