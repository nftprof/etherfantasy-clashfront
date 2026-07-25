import 'tailwindcss/tailwind.css';
import React, {useEffect, useState} from 'react'
import {BadgeCheckIcon, ExclamationIcon, InformationCircleIcon} from "@heroicons/react/solid";
import Link from "next/link";

interface Props {
    status: string;
    callBack: (bool: boolean) => void;
    selectedTokens: any;
    mintingStatus: any;
}

/**
 * Minting Status Component
 * @param status
 * @param callBack
 * @param selectedTokens
 * @param mintingStatus
 * @constructor
 */
function MintingStatus({ status, callBack, selectedTokens, mintingStatus } : Props) {

    return (
        <>
            
                <div className="text-white/75 bg-haiti-400 rounded-xl p-8 z-[999] max-w-[550px] w-full fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
                    <span className="text-2xl w-full block text-center mb-8 font-body">Current Progress</span>
                    <ul className="space-y-2">


                        {status !== 'error' &&
                            <li className="space-x-2 flex items-center justify-between border-b border-solid border-white/20 pb-2">

                                <span className={`${status !== 'allowance' && `opacity-[1]`}`}>Allow Tokens to be spent</span>
                                <span className={status !== 'allowance' && `opacity-[1]`}>
                                    {status === 'allowance' ?
                                        <InformationCircleIcon className="w-6 h-6 text-white" />
                                        :
                                        <BadgeCheckIcon className={`w-6 h-6 text-green-500`} />
                                    }
                                </span>
                            </li>
                        }

                        {(status !== 'error' && status !== 'allowance') &&
                            <li className={`${(status !== 'complete' && status !== 'minting') && `opacity-[0.25]`} space-x-2 flex items-center justify-between border-b border-solid border-white/20 pb-2`}>
                                
                                    <span>
        
                                        {status === 'minting' ?
                                            <>
                                                <span>Currently Minting Tokens</span>
                                                <div className="flex flex-wrap">
                                                    {selectedTokens && selectedTokens.map((child, key) => {
                                                        return (
                                                            <div key={key} className="pr-2">{child.paddedTokenId}</div>
                                                        )
                                                    })}
                                                </div>
                                            </>
                                            : status === 'complete' ?
                                                <span>Congratulations your tokens have been minted!</span>
                                                :
                                                <span>Accept the transaction to begin minting</span>
                                        }
                                       
        
                                        
                                    </span>
                                <span>
                                        {status !== 'complete' ?
                                            <InformationCircleIcon className="w-6 h-6 text-white" />
                                            :
                                            <BadgeCheckIcon className={`w-6 h-6 text-green-500`} />
                                        }
                                    </span>
                            </li>
                        }

                        {status === 'error' &&
                            <li className={`space-x-2 flex justify-between items-center border-b border-solid border-white/20 pb-2`}>
                                <span>
                                    <span>There was an error minting your tokens "{mintingStatus.msg}"</span>
                                </span>
                                <span>
                                    <ExclamationIcon className="w-6 h-6 text-red-500" />
                                </span>
                            </li>
                        }
                    </ul>

                    {status === 'error' &&
                        <button onClick={() => callBack(false)} className="button button-secondary mt-4 w-full">Close</button>
                    }

                    {status === 'complete' &&
                        <div className={`flex items-center justify-between space-x-6 text-center`}>
                            <Link href={`/account/land`}>
                                <span className={`button block w-full mt-4 text-center self-center`} >View Land</span>
                            </Link>
                            <button onClick={() => callBack(false)} className="button button-secondary mt-4 w-full">Close</button>
                        </div>
                    }
                </div>
            
        </>
    )
}
export default MintingStatus;
