// @ts-nocheck
import 'tailwindcss/tailwind.css';
import React, {useEffect, useRef, useState} from 'react'
import useSWR from "swr";
import { formatMoney } from '@helpers/helpers';
import Link from 'next/link';

/**
 * Get Experience By Slug
 * @param slug
 */
const getExperienceBySlug = async ({ slug }) => {
    const response = await fetch(`${process.env.NEXT_PUBLIC_API}/experiences/${slug}`);

    try {
        return await response.json();
    } catch (error) {
        console.log(error);
    }
}


/**
 * Selected Token List
 * @param param0
 * @returns
 */
function ActiveToken({ selectedTokens }) {
    const [ experienceInfo, setExperienceInfo ] = useState(null)
    const { data: selectedItemInfo } = useSWR(() => selectedTokens ? `https://api.cryptoverse.vip/land/${selectedTokens[0].paddedTokenId}` : null, {
        revalidateOnFocus: true,
        revalidateOnMount: true,
        revalidateOnReconnect: false,
        refreshWhenOffline: false,
        refreshWhenHidden: false,
        refreshInterval: 0,
    });

    useEffect(() => {
        if(selectedItemInfo) {
            (async () => {
                if(!selectedItemInfo?.result) return;
                const tokenId = selectedItemInfo.result.token_id;

                try {
                    const response = await getExperienceBySlug({ slug: tokenId });

                    if(response && response.result) {
                        setExperienceInfo(response.result);
                    } else {
                        setExperienceInfo(null)
                    }
                } catch(err) {
                    setExperienceInfo(null);
                    console.log(err);
                }
            })()
        }

    }, [  selectedItemInfo ])

    return (
        <>

            {selectedTokens !== null && selectedItemInfo &&
                <div className="scale-[0.85] origin-bottom-left rounded-tl-xl rounded-br-xl transition duration-700 shadow-xl shadow-torch-red/20 bg-haiti-400/100 shadow-2xl space-x-4 fixed bottom-0 mb-14 ml-4 z-[10] space-y-1 text-white left-0 flex w-[500px] bg-haiti-400 rounded-lg p-6">

                    <div className={`overflow-hidden rounded-2xl mb-4 w-1/2`}>
                        {selectedItemInfo && selectedItemInfo.result &&
                           <>
                               {selectedItemInfo.result.owner !== '' ?
                                   <a
                                       target={`_blank`}
                                       rel={`noreferrer`}
                                       href={`marketplace/${selectedItemInfo.result.type}/${selectedItemInfo.result.token_id}`}>
                                       <img src={selectedItemInfo.result.image_url} loading={'lazy'} className={`w-full h-full object-cover`}/>
                                   </a>
                               :
                                    <img src={selectedItemInfo.result.image_url} loading={'lazy'} className={`w-full h-full object-cover`}/>
                               }
                           </>
                        }
                    </div>

                    <div className={`space-y-1 w-1/2`}>
                        {experienceInfo &&
                            <img src={experienceInfo.logo_image} alt={experienceInfo.name} className={`w-[100px] mb-4`}/>
                        }
                        <span className="text-sm flex justify-between space-x-2 border-b border-solid border-white/20 pb-1"><span>TokenId:</span>
                            {selectedItemInfo && selectedItemInfo.result &&
                                <>
                                    {selectedItemInfo.result.owner !== '' ?
                                        <a target={`_blank`} rel={`noreferrer`} href={`marketplace/${selectedItemInfo.result.type}/${selectedItemInfo.result.token_id}`}>
                                            <span className={`underline text-torch-red`}>{selectedTokens[selectedTokens.length-1]?.paddedTokenId}</span>
                                        </a>
                                        :
                                        selectedTokens[selectedTokens.length-1]?.paddedTokenId
                                    }
                                </>
                            }
                        </span>
                        <span className="text-sm flex justify-between space-x-2 border-b border-solid border-white/20 pb-1"><span>Type:</span> {selectedTokens[selectedTokens.length-1]?.type}</span>
                        <span className="text-sm flex justify-between space-x-2 border-b border-solid border-white/20 pb-1"><span>Sold:</span> {selectedTokens[selectedTokens.length-1]?.sold ? 'Yes' : 'No'}</span>


                        {selectedItemInfo && selectedItemInfo.result &&
                            <>
                                <span className="text-sm flex justify-between space-x-2 border-b border-solid border-white/20 pb-1"><span>Zone:</span> {selectedItemInfo.result.zone_name}</span>
                                <span className="text-sm flex justify-between space-x-2 text-right border-b border-solid border-white/20 pb-1"><span>Size:</span> <span>{formatMoney(Math.abs(selectedItemInfo.result.size).toFixed(0))} M<sup>2</sup></span></span>
                                <>
                                    {selectedItemInfo.result.poi.length > 0 &&
                                        <>
                                            <span>Points of Interest:</span>
                                            <div className="grid grid-cols-2 gap-1">
                                                {selectedItemInfo.result.poi.map((poiData, key) => {
                                                    return (
                                                        <div key={key} className="text-xs border-2 self-center items-center flex items-center justify-center h-full border-solid border-orange-500 p-1 text-orange-400 font-bold rounded-lg text-center text-xs">
                                                            <span>{poiData}</span>
                                                        </div>
                                                    )
                                                })}
                                            </div>
                                        </>
                                    }
                                </>
                            </>
                        }

                        {experienceInfo &&
                            <>
                                <Link href={`/experiences/${experienceInfo.slug}`}>
                                    <button className={`button w-full mt-4`}>View Experience</button>
                                </Link>
                            </>
                        }
                    </div>
                </div>
            }

        </>
    )
}
export default ActiveToken;
