import * as THREE from "three";
import {TrackballControls} from "three/examples/jsm/controls/TrackballControls";
import Stats from "three/examples/jsm/libs/stats.module";
import {SVGLoader} from "three/examples/jsm/loaders/SVGLoader";
import THREEx from '@vendors/threex.domevents';
import Experiences from "@vendors/LandMap/Experiences/Experiences";
import { landHexColors } from "@vendors/LandMap/Defaults/Defaults";
import { padTokenIdL3, padTokenId } from "@vendors/LandMap/Helpers";
import Gui from "@vendors/LandMap/Gui";


/**
 * LandSelector Tool
 * Used within the Cryptoverse
 */

class LandMapTool {
    constructor({ container, showFps = true, showGrid = false, showGui = false, removeClickableObjects, marketplaceViewer = false, sameTypeValidation = true }) {
        this.removeClickableObjects = removeClickableObjects;
        this.showFps = showFps;
        this.showGui = showGui;
        this.showGrid = showGrid;
        this.sameTypeValidation = sameTypeValidation
        this.marketplaceViewer = marketplaceViewer;

        this.container = container;
        this.startLoadingTime = performance.now();
        this.scene = null;
        this.stats = null;
        this.camera = null;
        this.controls = null;
        this.l2 = [];
        this.l3 = [];
        this.debug = true;
        this.isDragging = false;
        this.selectedToMint = false;
        this.activeL3 = new THREE.Group();
        this.soldItems = [];
        this.loaded = false;
        this.experienceInstance = null;


        (async() => {
            this.getContainerSize();

            this.createScene();
            this.createLoader();
            this.createControls();
            this.loadObjectsIntoScene();
            this.isCurrentlyPanning();

            if(this.showFps) { this.createStats() }
            if(this.showGrid) { this.createGrid() }

            if(this.showGui) {
                new Gui({l2: this.l2, l3: this.l3, activeL3: this.activeL3})
            }

            // Main Animate RAF function
            // Potentially remove the RAF and only update when needed
            this.animate();


            /**
             * Load Manager
             * Any Loader that is called will onLoad when complete
             * This is good for firing commands when the map is fully completed
             */
            this.manager.onLoad = ()  => {
                this.endLoadingTime = performance.now();
                console.log(`Total load completed ${(Math.floor(this.endLoadingTime - this.startLoadingTime)) / 1000} seconds`)
                console.log( 'Loading complete!');

                if(!this.loaded) {
                    let mapLoaded = new CustomEvent('loadedMap');
                    document.dispatchEvent(mapLoaded);
                    this.loaded = true;
                    this.getContainerSize(true);
                }

                this.updateSoldLandItems()

                if(this.experienceInstance === null) {
                    this.experienceInstance = new Experiences({
                        scene: this.scene,
                        l2Map: this.l2,
                        render: this.animate
                    });
                }

            };

            /**
             * Resize Event Listener
             */
            window.addEventListener('resize', this.onResize, true);

            /**
             * Progress Listener
             */
            this.manager.onProgress = (progress) => {
                console.log(progress);
            }
        })();
    }


    /**
     * Resets the users Zoom level
     * @param zoomLevel
     */
    resetZoomLevel = ({ zoomLevel }) => {
        this.controls.target = new THREE.Vector3(0, 0, 0);
        this.camera.position.set(0, zoomLevel, 0);
    }

    /**
     * Tries to calculate the container size that the canvas is sat within
     * ForceResize forces the canvas to update
     * This will be useful when moving the camera to specific TokenId
     * @param {*} forceResize
     * @returns
     */
    getContainerSize = (forceResize = false) => {
        if(!this.container.current) return;

        let containerSize = this.container.current.getBoundingClientRect();

        this.containerWidth = containerSize.width;
        this.containerHeight = containerSize.height;

        if(forceResize) { this.onResize(); }

        return containerSize;
    }

    /**
     * Find the Child by their TokenId
     * Have to pass the padded TokenId for this to work
     * @param {} tokenId
     * @returns
     */
    findL2ChildByTokenId = (tokenId) => {
        let foundItem = null;

        for (let index = 0; index < this.l2.length; index++) {
            const l2Child = this.l2[index];

            for (let index = 0; index < l2Child.children.length; index++) {
                const l3Child = l2Child.children[index];

                if(tokenId === l3Child.paddedTokenId) {
                    foundItem = l3Child;
                }
            }
        }

        return foundItem;
    }

    /**
     * Find Child by Padded token Id
     * @param tokenId
     * @returns {null}
     */
    findL3ChildByTokenId = (tokenId) => {
        let foundItem = null;

        this.l3.map((l2Child) => {
            let mergedL3 = [...l2Child.children, ...this.activeL3.children];

            mergedL3.map((l3Child) => {
                if(String(tokenId) === String(l3Child.paddedTokenId)) {
                    foundItem = l3Child;
                }
            })
        })

        return foundItem;
    }

    /**
     * Make the L2 Children Grayscale
     * This is primarily used for Marketplace
     */
    makeL2ChildrenGrayscale = () => {
        for (let index = 0; index < this.l2.length; index++) {
            const l2Child = this.l2[index];

            for (let index = 0; index < l2Child.children.length; index++) {
                const l3Child = l2Child.children[index];

                //l3Child.material.color.setHex(0x000)
                l3Child.material.opacity = 0.35
            }
        }
    }

    makeL2ChildrenDefault = () => {
        for (let index = 0; index < this.l2.length; index++) {
            const l2Child = this.l2[index];

            for (let index = 0; index < l2Child.children.length; index++) {
                const l3Child = l2Child.children[index];
                l3Child.material.opacity = 1
                l3Child.material.color.setHex(landHexColors[l3Child.originalType])
                l3Child.sold = false;

                if(l3Child.type === "SINGLE") {
                    l3Child.material.color.setHex( landHexColors['SINGLE'] );
                }
            }
        }
    }

    /**
     * Find L1 By Zone Name
     * @param {*} zone
     * @returns
     */
    findL1ByZoneName = (zone) => {
        let foundChild = null;

        for (let index = 0; index < this.l2.length; index++) {
            const l1Child = this.l2[index];

            if(l1Child.name === zone) {
                foundChild = l1Child;
                break;
            }
        }

        return foundChild;
    }

    /**
     * Go to TokenId
     * @param tokenId
     * @param zone
     * @param Type
     * @param zoom
     * @param callback
     */
    goToTokenId = ({tokenId, zone, type, zoom = 50, callback}) => {

        if(type === 'l2') {
            const child = this.findL2ChildByTokenId(tokenId);

            if(child) {
                this.makeL2ChildrenGrayscale();

                child.material.color.setHex(landHexColors[child.originalType])
                child.material.opacity = 1;
                this.goToChild({ child, zoomLevel: zoom })

                if(typeof callback === 'function') {
                    return callback()
                }

                return true;
            }

            return false;
        }

        if(type === 'l3') {
            const l3Generated = this.l3.filter((l3Child) => l3Child.name === zone)

            if(l3Generated.length === 0) {

                let loadL3Data = new CustomEvent('loadingL3Data',  { 'detail': zone });
                document.dispatchEvent(loadL3Data);

                this.makeL2ChildrenGrayscale();

                this.loadAsync({ name: zone, file: `/svg/l3/${zone}.svg`, type: this.l3, landType: 'l3', callback: () => {
                        const l3Child = this.findL3ChildByTokenId(tokenId);
                        const l2Child = this.findL2ChildByTokenId(l3Child.parentPaddedTokenId);

                        let loadL3Data = new CustomEvent('loadingL3Data');
                        document.dispatchEvent(loadL3Data);

                        let l3EnabledItem = new CustomEvent('l3EnabledItemClicked',  {'detail' : { child: l2Child }});
                        document.dispatchEvent(l3EnabledItem);

                        this.goToTokenId({ tokenId: l3Child.parentPaddedTokenId, zone: zone, type: 'l2', zoom: 30});

                        l3Child.material.color.setHex('0xFF0000');

                        this.showSelectedL3(l2Child);

                        if(typeof callback === 'function') {
                            return callback()
                        }

                    }});
            } else {
                const l3Child = this.findL3ChildByTokenId(tokenId);

                if(l3Child !== null) {
                    this.makeL2ChildrenGrayscale();

                    this.goToTokenId({ tokenId: l3Child.parentPaddedTokenId, zone: zone, type: 'l2', zoom: 30});
                    l3Child.material.color.setHex('0xFF0000')

                    if(typeof callback === 'function') {
                        return callback()
                    }
                }
            }
        }
    }

    /**
     * Basic Setter for Adding Sold Items to the list
     * @param {*} items
     */
    addSoldItemsToList = (items) => {
        this.soldItems.push(...items);
        this.updateSoldLandItems();
    }

    /**
     * Update Sold Land Items
     * Receive update from
     * @param items
     */
    updateSoldLandItems = () => {
        console.warn('UPDATE: SOLD LAND')

        this.makeL2ChildrenDefault();
        this.makeL3ChildrenDefault();

        this.l3.map((l2Child) => {
            let mergedL3 = [...l2Child.children, ...this.activeL3.children];

            mergedL3.map((l3Child) => {
                let found = this.soldItems.includes(l3Child.paddedTokenId)

                if(found) {
                    l3Child.material.color.setHex(0xFF0000)
                    l3Child.sold = true;
                    //this.domEvents.removeEventListener(l3Child, 'click')
                }
            })
        });



        this.soldItems.map((item) => {
            const l2Child = this.findL2ChildByTokenId(item);

            if(l2Child) {
                l2Child.material.color.setHex(0xFF0000);
                l2Child.material.opacity = 0.75;
                l2Child.sold = true;
                //this.domEvents.removeEventListener(l2Child, 'click')
            }
        })
    }

    /**
     * Is Currently panning
     * Checks that the mouse is currently panning on the screen
     * we dont want a user to accidentally click a parcel whilst they are in drag mode
     *
     * @boolean this.isDragging
     */
    isCurrentlyPanning = () => {
        const delta = 6;
        let startX;
        let startY;

        this.renderer.domElement.addEventListener('mousedown',  (event) => {
            startX = event.pageX;
            startY = event.pageY;

            this.isDragging = true;

            return this.isDragging;
        });

        this.renderer.domElement.addEventListener('mouseup',  (event) => {
            const diffX = Math.abs(event.pageX - startX);
            const diffY = Math.abs(event.pageY - startY);

            if (diffX < delta && diffY < delta) {
                this.isDragging = false;
                return this.isDragging;
            }
        });
    }

    /**
     * Set the Child color to the appropriate size
     * @param {Mesh} child
     * @param type
     */
    setChildColorType = (child, typeOverride = '') => {
        if(child.type === 'EPIC') {
            child.material.color.setHex( landHexColors[child.type] );
            return;
        } else if(child.type === 'GIANT') {
            child.material.color.setHex( landHexColors[child.type] );
            return;
        } else if(child.type === 'LARGE') {
            child.material.color.setHex( landHexColors[child.type] );
            return;
        } else if(child.type === 'MEDIUM') {
            child.material.color.setHex( landHexColors[child.type] );
            return;
        } else if(child.type === 'SMALL') {
            child.material.color.setHex( landHexColors[child.type] );
            return;
        } else if(child.type === 'SINGLE' && !child.isL3) {
            child.material.color.setHex( landHexColors['SINGLE'] );
            return;
        } else if(child.type === 'SINGLE' && child.isL3) {
            child.material.color.setHex(this.generateL3GreenColor())
            return;
        }
    }

    destroyScene = () => {
        if(this.scene && this.scene.id) {
            cancelAnimationFrame(this.scene.id);
            window.removeEventListener('resize', this.onResize, true)

            this.scene = null;
            this.projector = null;
            this.camera = null;
            this.controls = null;
        }
    }

    /**
     * Add or remove the item from the selected Array
     * @param {Mesh} child
     * @returns
     */
    addToSelectedArray = (child) => {
        let dispatchSelectedToMint = new CustomEvent('selectedToMint',  { 'detail': { tokens: child } });

        this.makeL2ChildrenDefault();
        this.makeL3ChildrenDefault();
        this.updateSoldLandItems();

        if(this.selectedToMint?.paddedTokenId === child.paddedTokenId) {
            this.selectedToMint = null;

            dispatchSelectedToMint = new CustomEvent('selectedToMint',  { 'detail': { tokens: null } });
        } else {
            child.material.color.setHex(0xFF1200);
            this.selectedToMint = child;
        }

        document.dispatchEvent(dispatchSelectedToMint);
    }

    makeL3ChildrenDefault = () => {
        if(this.activeL3.children.length > 0) {
            this.activeL3.children.map((activeChild) => {
                activeChild.material.color.setHex(this.generateL3GreenColor());
                activeChild.sold = false;
            })
        }
    }


    /**
     * Create the Event Listeners
     */
    createEventListener = (child) => {
        /**
         * Allow Children to be hovered
         */
        if(this.marketplaceViewer) {

            this.domEvents.addEventListener(child, 'click', (event) => {
                if(this.isDragging) return;

                this.makeL2ChildrenGrayscale();
                this.makeL3ChildrenDefault();
                this.goToChild({ child: child, zoomLevel: 10 })

                let dispatchClickedToken = new CustomEvent('clickedToken',  { 'detail': { tokens: child } });
                document.dispatchEvent(dispatchClickedToken);

                if(child.isL3) {
                    child.material.color.setHex(this.generateL3GreenColor());
                } else {
                    setTimeout(() =>  {
                        child.material.color.setHex(landHexColors[child.originalType])
                        child.material.opacity = 1;
                    }, 10);
                }
            })
        }

        if(this.removeClickableObjects) return;

        /**
         * Create Event Listener for the specific child
         */
        this.domEvents.addEventListener(child, 'click', (event) => {
            if(this.isDragging) return;


            let dispatchClickedToken = new CustomEvent('clickedToken',  { 'detail': { tokens: child } });
            document.dispatchEvent(dispatchClickedToken);

            // If the Child is L3 E.g Single
            // And the Child Type is Not a single ... Add to the array
            if(child.isL3 || child.type !== 'SINGLE') {
                this.addToSelectedArray(child);
            }

            // Child Type is Single and is Not L3
            // Go to child and zoom in...Load the appropriate L3
            // Fire CustomEvent back to the react app to execute some react logic
            if(child.type === 'SINGLE' && !child.isL3) {
                this.goToChild({ child, zoomLevel: 10 });

                const l3Generated = this.l3.filter((l3Child) => l3Child.name === child.zone)

                // Event fires if an L3Enabled land item is clicked
                // This will make sure we can update the sold/minted items in the app
                let l3EnabledItem = new CustomEvent('l3EnabledItemClicked',  {'detail' : { child: child }});
                document.dispatchEvent(l3EnabledItem);

                if(l3Generated.length === 0) {
                    let loadL3Data = new CustomEvent('loadingL3Data',  { 'detail': child.zone });
                    document.dispatchEvent(loadL3Data);


                    this.loadAsync({ name: child.zone, file: `/svg/l3/${child.zone}.svg`, type: this.l3, landType: 'l3', callback: () => {

                            this.showSelectedL3(child);

                            let loadL3Data = new CustomEvent('loadingL3Data');
                            document.dispatchEvent(loadL3Data);
                        }});
                } else {
                    // If the l3 is already generated just show the L3 and update the sold land items
                    setTimeout(() => {
                        this.showSelectedL3(child);
                        this.updateSoldLandItems()
                    })
                }
            }
        })
    }

    /**
     * Show Selected L3
     * Once a user clicks on an L3 Enabled parcel we want to show the L3 children
     * @param child
     */
    showSelectedL3 = (child) => {
        child.updateMatrix();

        let itemsToBeAdded = [];

        this.l3.map((l3Child) => {
            if(l3Child.name === child.zone) {
                l3Child.updateMatrix();
                let instanced = l3Child.children;
                itemsToBeAdded.push(...instanced);
            }
        })

        itemsToBeAdded.map((singleL3Child) => {
            let splitName = singleL3Child.tokenId.split('_');

            if(splitName[0] === child.tokenId) {
                singleL3Child.rotation.x = 0.5 * Math.PI;
                singleL3Child.position.y = 0.01;
                singleL3Child.visible = true;

                singleL3Child.updateMatrix();
                this.activeL3.add(singleL3Child);
            }
        })


        // Base Color of L2
        child.material.color.setHex(this.generateL3GreenColor());
        this.scene.add(this.activeL3);
    }

    /**
     * GoTo specified child and zoomLevel
     * @param child
     * @param zoomLevel
     */
    goToChild = ({ child, zoomLevel }) => {
        child.geometry.computeBoundingBox();

        let boundingBox = child.geometry.boundingBox;

        let position = new THREE.Vector3();
        position.subVectors( boundingBox.max, boundingBox.min );
        position.multiplyScalar( 0.5 );
        position.add( boundingBox.min );
        position.applyMatrix4( child.matrixWorld );

        this.controls.target = new THREE.Vector3(position.x, 0, position.z);
        this.camera.position.set(position.x, zoomLevel, position.z);
    }

    /**
     *
     * Get L3 Parent
     * Getter used to get information about the current L3s parent
     *
     * @param zone String
     * @param TokenId String
     *
     * @returns
     */
    getL3Parent = ({ zone: zone, tokenId: tokenId }) => {
        let child;

        this.l2.map(childGroup => {
            if(childGroup.name === zone) {
                child = childGroup;
            }
        });

        if(!child) {
            console.log(`Might be error ${zone}?` , child);
        }

        //let finalData = child.children.filter((estate) => estate.tokenId === tokenId)

        let finalData = null;

        for (let index = 0; index < child.children.length; index++) {
            const estate = child.children[index];

            if(estate.tokenId === tokenId) {
                finalData = estate;
            }
        }

        return { originalType: finalData.originalType, paddedTokenId: finalData.paddedTokenId, tokenId: finalData.tokenId};
    }

    /**
     * Create the Loader
     */
    createLoader = () => {
        this.manager = new THREE.LoadingManager();
    }

    /**
     * Create the Initial controls
     * for the scene, Trackball controls as the initial setup
     */
    createControls = () => {
        this.controls = new TrackballControls( this.camera, this.renderer.domElement );
        this.domEvents = new THREEx.DomEvents(this.camera, this.renderer.domElement);

        this.controls.rotateSpeed = 1.0;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.4;

        this.controls.minDistance = 20;
        this.controls.maxDistance = 325;

        this.controls.noPan = false;
        this.controls.noRotate = true;
        this.controls.enableDamping = true;

        this.controls.mouseButtons.LEFT = THREE.MOUSE.PAN;
        this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.ROTATE;

        this.controls.keys = [ 'KeyA', 'KeyS', 'KeyD' ];
        this.controls.update();

        this.camera.updateProjectionMatrix();
    }

    /**
     * Create a Grid for debugging
     */
    createGrid = () => {
        if(!this.debug) return;
        this.scene.add(new THREE.GridHelper(this.containerWidth, 100));
    }
    /**
     * Create Stats for debugging
     */
    createStats = () => {
        if(!this.debug) return;
        this.stats = Stats();
        document.body.appendChild(this.stats.dom);
    }

    /**
     * On Resize
     */
    onResize = () => {
        this.getContainerSize();

        this.camera.aspect = this.containerWidth / this.containerHeight;
        this.camera.updateProjectionMatrix();
        //  this.renderer.outputEncoding = THREE.sRGBEncoding;
        this.renderer.setSize(this.containerWidth, this.containerHeight);
        this.render();
    }

    /**
     * Initial Render Function
     */
    render = () => {
        if(!this.controls) return;

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /**
     * Animate Function
     * Call requestAnimationFrame for the loop
     */
    animate = () => {
        requestAnimationFrame(() => this.animate());
        this.render();
        if(this.showFps) {
            this.stats.update();
        }
    }

    /**
     * The main function to load the L1 and L2 on to the scene
     * We load them sequentially with callbacks
     * Since we load the L3s Dynamically it's not important for us to worry about them for now
     * Will greatly improve the performance time of the application
     */
    loadObjectsIntoScene = () => {
         this.loadImage({ name: 'CLOUD', size: { w: 362/5, h: 151/5 }, image: '/svg/l1/cloud-1.png', group: 'cloudGroup', pos: { x: 250, y: 125, z: 100 } });
         this.loadImage({ name: 'CLOUD', size: { w: 362/1.4, h: 151/1.4 }, image: '/svg/l1/cloud-1.png', group: 'cloudGroup', pos: { x: 300, y: 175, z: 150 } });

        this.loadImage({ name: 'EDU', size: { w: 164, h: 162 }, image: '/svg/l1/edu-2.png', group: 'eduGroup', pos: { x: 0, y: 0, z: -0}, callback: () => {
                this.loadAsync({ name: 'EDU', file: '/svg/l2/EDU.svg', type: this.l2, landType: 'l2'});
            } });

        this.loadImage({ name: 'ENT', size: { w: 298, h: 542 }, image: '/svg/l1/ent-2.png', group: 'entGroup', pos: { x: 0, y: 0, z: 0}, callback: () => {
                this.loadAsync({ name: 'ENT', file: '/svg/l2/ENT.svg', type: this.l2, landType: 'l2'});
            }})

        this.loadImage({ name: 'BUS', size: { w: 362, h: 253 }, image: '/svg/l1/bus-2.png', group: 'busGroup', pos: { x: 0, y: 0, z: -0}, callback: () => {
                this.loadAsync({ name: 'BUS', file: '/svg/l2/BUS.svg', type: this.l2, landType: 'l2'});
            } });

        this.loadImage({ name: 'HUB', size: { w: 364, h: 249 }, image: '/svg/l1/hub-2.png', group: 'hubGroup', pos: { x: 0, y: 0, z: -0}, callback: () => {
                this.loadAsync({ name: 'HUB', file: '/svg/l2/HUB.svg', type: this.l2, landType: 'l2'});
            }})

        this.loadImage({ name: 'UW2', size: { w: 155, h: 155 }, image: '/svg/l1/uw2-2.png', group: 'uw2Group', pos: { x: 0, y: 0, z: 0}, callback: () => {
                this.loadAsync({ name: 'UW2', file: '/svg/l2/UW2.svg', type: this.l2, landType: 'l2'});
            }})

        this.loadImage({ name: 'UW3', size: { w: 70, h: 70 }, image: '/svg/l1/uw3-2.png', group: 'uw3Group', pos: { x: 0, y: 0, z: -0}, callback: () => {
                this.loadAsync({ name: 'UW3', file: '/svg/l2/UW3.svg', type: this.l2, landType: 'l2'});
            }});

        this.loadImage({ name: 'HS1', size: { w: 123, h: 123 }, image: '/svg/l1/hs1-2.png', group: 'hs1Group', pos: { x: 0, y: 0, z: -0}, callback: () => {
                this.loadAsync({ name: 'HS1', file: '/svg/l2/HS1.svg', type: this.l2, landType: 'l2'});
            } });

        this.loadImage({ name: 'HS2', size: { w: 123, h: 123 }, image: '/svg/l1/hs1-2.png', group: 'hs2Group', pos: { x: 0, y: 0, z: -0}, callback: () => {
                this.loadAsync({ name: 'HS2', file: '/svg/l2/HS2.svg', type: this.l2, landType: 'l2'});
            } });

        this.loadImage({ name: 'HS3', size: { w: 123, h: 123 }, image: '/svg/l1/hs1-2.png', group: 'hs3Group', pos: { x: 0, y: 0, z: -0}, callback: () => {
                this.loadAsync({ name: 'HS3', file: '/svg/l2/HS3.svg', type: this.l2, landType: 'l2'});
            } });


        this.loadImage({ name: 'UW1', size: { w: 155, h: 155 }, image: 'svg/l1/uw1-2.png', group: 'uw1Group', pos: { x: 0, y: 0, z: 0}, callback: () => {
                this.loadAsync({ name: 'UW1', file: '/svg/l2/UW1.svg', type: this.l2, landType: 'l2'});
            }})

    }

    /**
     * Generate L3 Green Color
     * @returns
     */
    generateL3GreenColor = () => {
        const componentToHex = (c) => {
            var hex = c.toString(16);
            return hex.length == 1 ? "0" + hex : hex;
        }

        const rgbToHex = (r, g, b) => {
            return "0x" + componentToHex(r) + componentToHex(g) + componentToHex(b);
        }

        let randGreen = (Math.random() * 150) + 25;

        return rgbToHex(0, parseInt(randGreen), 125);
    }

    /**
     *
     * Main loader here we load the entire map
     * along with all of the relevent token information
     * @param {string} name
     * @param {string} file
     * @param {string} landType
     * @param {function} callback
     */
    loadAsync = async ({ name, file, landType, callback = null }) => {
        const loader = new SVGLoader(this.manager);

        loader.load(file, ( data) => {
            const landPositions = {
                'ENT' : { x: -190, y: 0, z:-10, name: 'entGroup' },
                'EDU' : { x: 100, y: 0, z: 150, name: 'eduGroup' },
                'BUS' : { x: 40, y: 0, z: -200, name: 'busGroup' },

                'UW1' : { x: 310, y: 0, z:-210, name: 'uw1Group' },
                'UW2' : { x: 475, y: 0, z:-210, name: 'uw2Group' },
                'UW3' : { x: 600, y: 0, z:-210, name: 'uw3Group' },
                'HS1' : { x: 300, y: 0, z: 100, name: 'hs1Group' },
                'HS2' : { x: 425, y: 0, z:175, name: 'hs2Group' },
                'HS3' : { x: 300, y: 0, z:245, name: 'hs3Group' },
                'HUB' : { x: 0, y: 0, z:0, name: 'hubGroup' },
            }


            const paths = data.paths;
            const group = new THREE.Group();

            let i = 0, len = paths.length;

            while (i < len) {
                const path = paths[ i ];

                const fillColor = path.userData.style.fill;
                if ( fillColor !== undefined && fillColor !== 'none' ) {


                    const material = new THREE.MeshBasicMaterial( {
                        visible: true,
                        transparent: true,
                        side: THREE.DoubleSide,
                        depthWrite: false,
                    } );

                    material.color.setHex(this.generateL3GreenColor());

                    const shapes = SVGLoader.createShapes( path );

                    for ( let j = 0; j < shapes.length; j ++ ) {
                        const shape = shapes[ j ];
                        const geometry = new THREE.ShapeGeometry( shape );
                        const mesh = new THREE.Mesh( geometry, material );


                        // Pull the Token Id From the PATH data
                        // Stored as attribute token_id
                        if(paths[i].userData.node.getAttribute('token_id')) {
                            mesh.tokenId = paths[i].userData.node.getAttribute('token_id');
                            mesh.zone = paths[i].userData.node.getAttribute('zone');
                            mesh.type = paths[i].userData.node.getAttribute('type');
                            mesh.originalType = mesh.type;

                            let l3Enabled = paths[i].userData.node.getAttribute('l3Enabled');

                            this.setChildColorType(mesh);


                            if(landType === 'l2') {
                                mesh.isL3 = false;
                                mesh.paddedTokenId = padTokenId({ tokenId: mesh.tokenId, type: mesh.type, zone: mesh.zone})
                                mesh.name = Number(mesh.paddedTokenId);
                            }

                            if(landType === 'l3') {
                                let splitName = String(mesh.tokenId).split('_');
                                let l2Data = this.getL3Parent({ zone: name, tokenId: splitName[0] });

                                mesh.parentType = l2Data.originalType;
                                mesh.parentTokenId = l2Data.tokenId;
                                mesh.parentPaddedTokenId = l2Data.paddedTokenId;
                                mesh.isL3 = true;
                                mesh.type = 'SINGLE';
                                mesh.paddedTokenId = padTokenIdL3({ l2Id: splitName[0], l3Id: splitName[1], zone: name, size: l2Data.originalType })
                                mesh.position.set(landPositions[name].x, landPositions[name].y, landPositions[name].z);
                            }

                            if(l3Enabled) {
                                mesh.originalType = mesh.type;
                                mesh.type = 'SINGLE';
                                mesh.l3Enabled = true;
                                mesh.material.color.setHex(landHexColors['SINGLE'] );
                            }
                        }

                        // mesh.matrixAutoUpdate = false;

                        group.name = name;
                        group.add( mesh );

                        this.createEventListener(mesh);
                    }
                }
                i++
            }

            if(landType === 'l2') {
                group.rotation.x = 0.5 * Math.PI;

                this[landPositions[name].name].add(group);
                this[landPositions[name].name].position.set(landPositions[name].x, landPositions[name].y, landPositions[name].z);
                this[landPositions[name].name].children[0].visible = true;

                this.l2.push(group);

                //this.scene.add(group);
            } else if (landType === 'l3') {
                group.rotation.x = 0.5 * Math.PI;
                group.position.set(landPositions[name].x, landPositions[name].y, landPositions[name].z);
                this.l3.push(group);
            }

            if(typeof callback === 'function') {
                setTimeout(() => {
                    return callback();
                }, 10);
            }
        });
    }

    /**
     * Load Image
     */
    loadImage = ({ name, image, group, pos, callback, size}) => {
        // instantiate a loader
        const loader = new THREE.TextureLoader();

        this[group] = new THREE.Group();

        // load a image resource
        loader.load(
            // resource URL
            image,

            // onLoad callback
            ( image ) => {
                const geometry = new THREE.PlaneGeometry(size.w, size.h);
                const material = new THREE.MeshBasicMaterial({map: image });
                const mesh = new THREE.Mesh(geometry, material);

                mesh.material.transparent = true;
                mesh.material.opacity = 1;
                mesh.userData.name = name;
                mesh.visible = false;

                if(group === 'cloudGroup') {
                    mesh.visible = true;
                }

                geometry.sRGBEncoding = true;

                mesh.rotation.x = -0.5 * Math.PI;
                mesh.position.set(pos.x,pos.y,pos.z);

                this[group].add( mesh );
                this.scene.add(this[group]);

                if(typeof callback === 'function') {
                    return callback();
                }

            },

            // onProgress callback currently not supported
            undefined,

            // onError callback
            function (e) {
                console.error( 'An error happened.',  e);
            }
        );
    }

    /**
     * Setter to create the initial scene
     * Adding
     */
    createScene = () => {
        this.scene = new THREE.Scene();
        this.camera  = new THREE.PerspectiveCamera( 45, this.containerWidth / this.containerHeight, 10, 500 );
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setPixelRatio( window.devicePixelRatio );

        this.renderer.setSize(this.containerWidth, this.containerHeight);
        this.scene.background = new THREE.Color(0x0064A5);

        //   this.createLighting();

        // Set Initial Position
        this.camera.position.set(0, 400, 0);
        this.camera.up.set(0, 0, -1);
        this.camera.lookAt(0, 0, 0);
        this.container.current.appendChild(this.renderer.domElement);
    }
}

export default LandMapTool;