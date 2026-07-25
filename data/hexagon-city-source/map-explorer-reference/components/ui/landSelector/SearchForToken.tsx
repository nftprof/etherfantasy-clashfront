// @ts-nocheck
import 'tailwindcss/tailwind.css';
import React, {useEffect, useRef, useState} from 'react'
import {QuestionMarkCircleIcon, SearchIcon, XIcon} from "@heroicons/react/solid"
import {toast} from "react-toastify";

/**
 * Ssearch for token
 * @returns 
 */
function SearchForToken({ selectedTokens, scene }: any) {
    const [ searchOpen, setSearchOpen ] = useState(false);
    const [ searchedTokenId, setSearchTokenId ] = useState('');

    return (
        <>
                <div className={`relative`}>

                    <div onClick={() =>  {
                        setSearchOpen(!searchOpen)
                        if(searchOpen) {
                            scene.makeL2ChildrenDefault();
                            scene.updateSoldLandItems();
                        }
                    }} className={`transition hover:scale-[0.90] flex flex-col relative z-[100] text-center text-white space-y-1 justify-center items-center`}>
                        <div className={`bg-torch-red rounded-full p-2`}>
                            {!searchOpen ?<SearchIcon className="w-4 h-4 text-white fill-white" /> : <XIcon className="w-4 h-4 text-white fill-white" /> }
                        </div>
                        {!searchOpen && <span className={"text-[11px] font-bold"}>Search</span> }
                    </div>


                
                    {searchOpen &&
                        <div className="rounded-tl-xl rounded-br-xl transition duration-700 m-3 shadow-xl shadow-torch-red/20 bg-haiti-400/100 border-2 border-solid border-torch-red shadow-2xl absolute top-0 z-[99] flex flex-col space-y-1 text-white left-0 bg-haiti-400 rounded-lg p-6">
                            
                            <div className="flex items-center space-x-2">
                            <input onChange={(e) => setSearchTokenId(e.target.value)} placeholder="Enter Token Id" type="text" className="bg-haiti-500 p-2 rounded-lg" />
                                <button className="button" onClick={async () => {
                                    if(searchedTokenId !== '') {
                                        try {
                                            const response = await fetch(`https://api.cryptoverse.vip/land/${searchedTokenId}`);
                                            const json = await response.json();

                                            if(json.result) {
                                                let gotoToken = scene.goToTokenId({ tokenId: searchedTokenId, zone: json.result.zone_name, type: json.result.type === 'estate' ? 'l2' : 'l3', zoom: 200 })
                                                return true;
                                            }

                                            toast.clearWaitingQueue();
                                            toast.error(`Couldn't find TokenId, try again!`);

                                        } catch(e) {
                                            toast.clearWaitingQueue();
                                            toast.error(`Couldn't find TokenId, try again!`);
                                        }

                                    } else {
                                        scene.makeL2ChildrenDefault();
                                    }
                                }}>Search</button>
                            </div>
                            <div className="text-torch-red underline text-right cursor-pointer hover:text-torch-red-400" onClick={() => {
                                scene.makeL2ChildrenDefault()
                                scene.updateSoldLandItems();
                            }}>Reset Map</div>
                        </div>
                    }
                </div>
        </>
    )
}
export default SearchForToken;
