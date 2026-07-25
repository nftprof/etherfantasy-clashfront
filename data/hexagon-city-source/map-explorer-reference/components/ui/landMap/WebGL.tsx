// @ts-nocheck
import 'tailwindcss/tailwind.css';
import React, {useEffect, useRef, useState} from 'react'
import useSWR from "swr";

import SearchForToken from '@ui/landSelector/SearchForToken';
import TokenLegend from '@ui/landSelector/TokenLegend';
import Help from '@ui/landSelector/Help';

import ClipLoader from "react-spinners/ClipLoader";
import ResetMap from "@ui/landSelector/ResetMap";
import MapVisiblity from "@ui/landSelector/MapVisibility";
import useMintLand from "@components/hooks/useMintLand";
import LandMapTool from "@vendors/LandMap/LandMap";
import ActiveToken from "@ui/landMap/ActiveToken";


/**
 * WebGL version of landSelector
 * @constructor
 */
function WebGL() {
    const [ dataLoaded, setDataLoaded ] = useState(false);
    const containerRef = useRef();
    const [ scene, setScene ] = useState(null);
    const [ selectedTokens, setSelectedTokens ] = useState([]);
    const [ loadingL3Data, setLoadingL3Data ] = useState(false);
    const { mintSelectedTokens, mintingStatus, setMintingStatus } = useMintLand();
    const [ selectedL2EnabledItem, setSelectedL2EnabledItem ] = useState('');

    const { data: soldItems } = useSWR(`https://api.cryptoverse.vip/land/minted/l2`, { refreshInterval: 5000 });
    const { data: soldItemsL3 } = useSWR(`https://api.cryptoverse.vip/land/minted/l3/${selectedL2EnabledItem}`, { refreshInterval: 5000 });

    const canvas = document.querySelectorAll('.aspect-video canvas');

    useEffect(() => {

        if(scene === null && canvas?.length === 0) {
           const internalScene = new LandMapTool({
                container: containerRef,
                showFps: false,
                showGui: true,
                removeClickableObjects: false,
                marketplaceViewer: false
            });

            setScene(internalScene);
        }
    }, [ ])

    /**
     * Event Listeners
     * that are used within the THREEJS Application
     * we listen for any events that are fired by the application
     *
     */
    useEffect(() => {
        document.addEventListener("loadedMap", (e) => {
            setDataLoaded(true);

        });

        /**
         * Listener to add selected Tokens to mint
         *
         */
        document.addEventListener("selectedToMint", function (e) {
            console.log(e.detail.tokens);
            setSelectedTokens([e.detail.tokens]);
        });

        /**
         * Once an L2Enabled is clicked
         * we want to pull the minted items / locked tokens for this piece of land
         *
         */
        document.addEventListener("l3EnabledItemClicked", function (e) {
            let tokenId = e.detail.child.paddedTokenId;
            setSelectedL2EnabledItem(`${tokenId}`)
        });

        document.addEventListener("loadingL3Data", function (e) {
            if(e.detail  === null) {
                setLoadingL3Data(false);
            } else {
                setLoadingL3Data({ data: e.detail });
            }
        });
    }, [])

    /**
     * Apply effect only if soldItemsL3 changes
     * We want to apply the effect and add to the sold array only
     * when a user clicks on an available l2 - l3Enabled
     */
    useEffect(() => {
        if(scene !== null && soldItemsL3 && soldItemsL3.length) {
            scene.addSoldItemsToList(soldItemsL3.map(String))
            scene.updateSoldLandItems();
        }
    }, [ soldItemsL3 ])

    /**
     * OnData load and soldItem updates
     * We want to update the sold items on the scene
     * Set the User Balances also
     */
    useEffect(() => {
        if(scene !== null && dataLoaded && soldItems) {
            scene.addSoldItemsToList(soldItems.map(String))
            scene.updateSoldLandItems();
        }
    }, [ scene, dataLoaded, soldItems ])


    useEffect(() => {

    }, [ selectedTokens ])

    /**
     * Add the Canvas to the scene
     * Make sure to destroy the scene when the component unmounts
     *
     */
    useEffect(() => {
        if(scene === null) return;

        let threeScene = scene;

        return () => {
            const canvasElements = document.querySelectorAll('canvas, .lil-gui, .aspect-video canvas');

            canvasElements.forEach((element) => element.remove())

            threeScene.destroyScene();
            setScene(null);
        }
    }, [ scene ])

    useEffect(() => {
        if(mintingStatus.status === 'complete') {
            // Callback the balance update
            callback();
            selectedTokens.map((child) => {
                scene.addToSelectedArray(child);
            })
        }
    }, [ mintingStatus ])


    return (
        <>



            {/*
                Create the SideBar Menu
                Which will help users search, navigate and also understand the map
            */}
            {scene !== null &&
                <aside className={`fixed top-0 left-0 p-6 left-0 pt-32 pointer-events-none bg-gradient-to-r h-full from-haiti-400/60 to-transparent`}>
                    <div className={`pointer-events-auto flex flex-col space-y-4`}>
                        <ResetMap reset={() => scene.resetZoomLevel({ zoomLevel: 400 })} />
                        <Help />
                        <SearchForToken
                            selectedTokens={selectedTokens}
                            scene={scene}
                        />
                    </div>
                </aside>
            }


            <ActiveToken
                selectedTokens={selectedTokens}
            />

            {/*
                Token Legend, to show the sizes for each map type
            */}
            <div className="fixed bg-gradient-to-t flex items-center space-x-2 h-[50px] from-haiti-400 via-haiti-400 to-transparent bottom-0 left-0 w-full flex items-center p-4">
                <span className={`font-bold text-xs text-white flex-shrink-0`}>Land Types:</span>
                <TokenLegend />
                <MapVisiblity />

            </div>

            {loadingL3Data &&
                <div className="p-10 max-h-[160px] flex-col space-y-4 items-center justify-center top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-white font-bold bg-haiti-400 rounded-lg fixed bottom-0 left-0 shadow-2xl z-[999]">
                    <span className="text-white/70">Loading Single Data for {loadingL3Data?.data}</span>
                    <div className="flex justify-center items-center origin-right">
                        <ClipLoader speedMultiplier={1} color={`rgba(255,255,255, 0.45)`} size={45} />
                    </div>
                </div>
            }

            {!dataLoaded &&
                <div className={`group max-w-[500px] flex flex-col items-center justify-center space-y-4 text-center  w-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-haiti-400/100 rounded-2xl p-16`}>
                    <img src="/brand-vertical@2x.png" className={`max-w-[200px]`} alt=""/>
                    <div>
                        <p>Currently loading map data,<br/>please wait until active files have been downloaded.</p>
                        <div className="flex justify-center items-center origin-right">
                            <ClipLoader speedMultiplier={1} color={`rgba(255,255,255, 0.45)`} size={45} />
                        </div>
                    </div>

                </div>
            }
            <div ref={containerRef} className="w-full h-screen"></div>
        </>
    )
}
export default WebGL;
