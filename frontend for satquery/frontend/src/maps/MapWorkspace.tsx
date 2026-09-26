import { useEffect, useRef, type MutableRefObject } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as Cesium from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';

export type MapMode = '2d' | 'globe';
export type LayerModel = { id:string; name:string; color:string; visible:boolean; opacity:number; order:number; demo:boolean };
export type MapMarker = { lat:number; lon:number; label:string };
export type MapState = { center:[number,number]; zoom:number; aoi:[number,number][]; point?:[number,number]; tool:'point'|'rect'|null; basemap:'OSM Standard'|'Satellite'|'Terrain' };
export type MapRefApi = { invalidateSize?:()=>void; resize?:()=>void; flyTo?:(center:[number,number], zoom?:number, options?:{duration?:number})=>void };
type GeoFeatureCollection = {type:'FeatureCollection';features:any[]};
type Props = { mode:MapMode; state:MapState; layers:LayerModel[]; onState:(next:Partial<MapState>)=>void; mapRef?:MutableRefObject<MapRefApi|null>; mapOverlay?:GeoFeatureCollection | null; markers?:MapMarker[]; onOverlayFeatureClick?:(feature:any)=>void };

const tiles={
  'OSM Standard':{url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',attribution:'© OpenStreetMap contributors'},
  Satellite:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}.png',attribution:'Tiles © Esri'},
  Terrain:{url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',attribution:'Map data © OpenStreetMap contributors, SRTM | Map style © OpenTopoMap'}
};
const featureAnchors:[[number,number],[number,number],[number,number],[number,number],[number,number]]=[[23.17,85.14],[23.36,85.40],[23.57,85.03],[23.07,85.65],[23.48,85.67]];
const sameView=(map:L.Map,state:MapState)=>map.getZoom()===state.zoom&&map.getCenter().distanceTo(L.latLng(state.center))<.5;
const aoiStyle={color:'#5E7892',weight:2,fillColor:'#A7B7C6',fillOpacity:.2};

function addOverlay(group:L.LayerGroup,state:MapState,layers:LayerModel[],mapOverlay?:GeoFeatureCollection|null,onOverlayFeatureClick?:Props['onOverlayFeatureClick']){
  group.clearLayers();
  if(state.aoi.length>=3)L.polygon(state.aoi,aoiStyle).bindTooltip('Current AOI · DEMO DATA').addTo(group);
  if(state.point)L.circleMarker(state.point,{radius:7,color:'#5E7892',fillColor:'#A7B7C6',fillOpacity:1}).bindTooltip(`Selected point · ${state.point[0].toFixed(4)}, ${state.point[1].toFixed(4)}`).addTo(group);
  const liveFeatures = mapOverlay?.features || [];
  const liveLayerVisible = (feature:any) => {
    const props = feature?.properties || {};
    const overlayLayer = String(props.overlay_layer || props.hazard_layer || '').toLowerCase();
    if (overlayLayer === 'parcel') return layers.some(l=>l.id==='parcel' && l.visible);
    if (overlayLayer === 'flood') return layers.some(l=>l.id==='flood' && l.visible);
    if (overlayLayer === 'weather') return layers.some(l=>l.id==='weather' && l.visible);
    return false;
  };
  const styleFor = (feature:any) => {
    const props = feature?.properties || {};
    const kind = String(props.overlay_layer || props.hazard_layer || '').toLowerCase();
    const layer = kind === 'parcel' ? layers.find(l=>l.id==='parcel') : kind === 'flood' ? layers.find(l=>l.id==='flood') : layers.find(l=>l.id==='weather');
    return {color:layer?.color || '#5E7892', weight:2, fillColor:layer?.color || '#5E7892', fillOpacity:Math.max(.08,(layer?.opacity || .6)*.24)};
  };
  liveFeatures.filter(liveLayerVisible).forEach((feature:any)=>{
    L.geoJSON(feature,{style:styleFor,onEachFeature:(f:any,lyr:any)=>{
      const props=f?.properties||{}; const label=props.parcel_id || props.id || props.hazard_type || props.name || props.hazard_layer || 'Live GeoAI feature';
      lyr.bindTooltip(String(label));
      if(onOverlayFeatureClick)lyr.on('click',()=>onOverlayFeatureClick(f));
    }}).addTo(group);
  });
  layers.filter(l=>l.visible && ['s2','ndvi','flood'].includes(l.id)).forEach((layer,index)=>{
    const r = 4200 - index*320;
    featureAnchors.slice(0,3).forEach((anchor,i)=>{
      const radius=Math.max(900,(r+i*620)%2600);
      L.circle(anchor,{radius,color:layer.color,weight:1.5,fillColor:layer.color,fillOpacity:Math.max(.06,layer.opacity*.14)}).bindTooltip(`${layer.name} · DEMO DATA`).addTo(group);
    });
  });

}

function LeafletMap({state,layers,onState,mapRef,mapOverlay,markers,onOverlayFeatureClick}:Omit<Props,'mode'>){
  const host=useRef<HTMLDivElement>(null),map=useRef<L.Map|null>(null),base=useRef<L.TileLayer|null>(null),overlay=useRef<L.LayerGroup|null>(null),markerLayer=useRef<L.LayerGroup|null>(null),draft=useRef<L.LayerGroup|null>(null),rectStart=useRef<L.LatLng|null>(null),rectPreview=useRef<L.Rectangle|null>(null),applying=useRef(false),latest=useRef(state);
  latest.current=state;
  useEffect(()=>{if(!host.current||map.current)return;const instance=L.map(host.current,{zoomControl:false}).setView(state.center,state.zoom);map.current=instance;L.control.zoom({position:'bottomright'}).addTo(instance);overlay.current=L.layerGroup().addTo(instance);draft.current=L.layerGroup().addTo(instance);
    if(mapRef)mapRef.current={invalidateSize:()=>instance.invalidateSize({pan:false}),resize:()=>{},flyTo:(center,zoom,options)=>instance.flyTo(center,zoom,options)};
    markerLayer.current=L.layerGroup().addTo(instance);
    instance.on('moveend',()=>{if(!applying.current)onState({center:[instance.getCenter().lat,instance.getCenter().lng],zoom:instance.getZoom()})});
    instance.on('click',event=>{if(latest.current.tool==='point')onState({point:[event.latlng.lat,event.latlng.lng],tool:null})});
    instance.on('mousedown',event=>{if(latest.current.tool!=='rect')return;rectStart.current=event.latlng;instance.dragging.disable()});
    instance.on('mousemove',event=>{if(!rectStart.current||latest.current.tool!=='rect')return;rectPreview.current?.remove();rectPreview.current=L.rectangle(L.latLngBounds(rectStart.current,event.latlng),aoiStyle).addTo(draft.current!)});
    instance.on('mouseup',event=>{if(!rectStart.current||latest.current.tool!=='rect')return;const bounds=L.latLngBounds(rectStart.current,event.latlng),sw=bounds.getSouthWest(),ne=bounds.getNorthEast();rectStart.current=null;rectPreview.current=null;instance.dragging.enable();draft.current?.clearLayers();onState({aoi:[[sw.lat,sw.lng],[sw.lat,ne.lng],[ne.lat,ne.lng],[ne.lat,sw.lng]],tool:null})});
    return()=>{instance.remove();map.current=null;if(mapRef)mapRef.current=null};
  },[]);
  useEffect(()=>{const instance=map.current;if(!instance)return;base.current?.remove();base.current=L.tileLayer(tiles[state.basemap].url,{attribution:tiles[state.basemap].attribution,maxZoom:19}).addTo(instance)},[state.basemap]);
  useEffect(()=>{if(overlay.current)addOverlay(overlay.current,state,layers,mapOverlay,onOverlayFeatureClick)},[state.aoi,state.point,layers,mapOverlay]);
  useEffect(()=>{const group=markerLayer.current;if(!group)return;group.clearLayers();(markers||[]).forEach(marker=>L.circleMarker([marker.lat,marker.lon],{radius:7,color:'#D95F59',fillColor:'#F4A261',fillOpacity:.9,weight:2}).bindPopup(marker.label).addTo(group))},[markers]);
  useEffect(()=>{const instance=map.current;if(!instance||sameView(instance,state))return;applying.current=true;instance.setView(state.center,state.zoom,{animate:false});requestAnimationFrame(()=>{applying.current=false})},[state.center,state.zoom]);
  useEffect(()=>{const observer=new ResizeObserver(()=>map.current?.invalidateSize({pan:false}));if(host.current)observer.observe(host.current);return()=>observer.disconnect()},[]);
  return <div className={`leaflet-map drawing-${state.tool||'none'}`} ref={host}/>;
}

function GlobeMap({state,layers,mapRef,mapOverlay}:Props){
  const host=useRef<HTMLDivElement>(null),viewer=useRef<Cesium.Viewer|null>(null),lastCenter=useRef('');
  useEffect(()=>{if(!host.current)return;(window as unknown as {CESIUM_BASE_URL:string}).CESIUM_BASE_URL='/cesium';const instance=new Cesium.Viewer(host.current,{animation:false,timeline:false,baseLayerPicker:false,geocoder:false,homeButton:false,navigationHelpButton:false,sceneModePicker:false,infoBox:false,selectionIndicator:false,terrainProvider:new Cesium.EllipsoidTerrainProvider(),baseLayer:false});instance.imageryLayers.addImageryProvider(new Cesium.OpenStreetMapImageryProvider({url:'https://tile.openstreetmap.org/'}));viewer.current=instance;if(mapRef)mapRef.current={invalidateSize:()=>instance.resize(),resize:()=>instance.resize(),flyTo:(center)=>{instance.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(center[1],center[0],18000000),duration:.5})}};return()=>{instance.destroy();if(mapRef)mapRef.current=null}},[]);
  useEffect(()=>{const instance=viewer.current;if(!instance)return;instance.entities.removeAll();if(state.aoi.length>=3)instance.entities.add({polygon:{hierarchy:Cesium.Cartesian3.fromDegreesArray(state.aoi.flatMap(([lat,lng])=>[lng,lat])),material:Cesium.Color.fromCssColorString('#A7B7C6').withAlpha(.25),outline:true,outlineColor:Cesium.Color.fromCssColorString('#5E7892')}});const live = mapOverlay?.features || [];
    live.forEach((feature:any)=>{const g=feature?.geometry; if(!g)return; const coords:any[] = g.coordinates || []; const flatten=(v:any):number[][]=>Array.isArray(v)&&typeof v[0]==='number'?[v]:v.flatMap(flatten); const pts=flatten(coords); if(!pts.length)return; const lon=pts.reduce((a,p)=>a+p[0],0)/pts.length, lat=pts.reduce((a,p)=>a+p[1],0)/pts.length; const kind=String(feature?.properties?.overlay_layer||feature?.properties?.hazard_layer||''); const layer=layers.find(l=>l.id===kind); if(layer?.visible) instance.entities.add({position:Cesium.Cartesian3.fromDegrees(lon,lat),point:{pixelSize:8,color:Cesium.Color.fromCssColorString(layer.color)},label:{text:`${kind.toUpperCase()} · LIVE`,font:'10px sans-serif',fillColor:Cesium.Color.WHITE,outlineColor:Cesium.Color.BLACK,outlineWidth:2,pixelOffset:new Cesium.Cartesian2(0,-14)}});});const nextCenter=state.center.join(',');if(lastCenter.current!==nextCenter){lastCenter.current=nextCenter;instance.camera.flyTo({destination:Cesium.Cartesian3.fromDegrees(state.center[1],state.center[0],18000000),duration:.5})}},[state.center,state.aoi,layers,mapOverlay]);
  return <div className="cesium-wrap"><div className="cesium-map" ref={host}/></div>;
}

export function MapEngine(props:Props){return props.mode==='2d'?<LeafletMap {...props}/>:<GlobeMap {...props}/>}

function layersForDate(dateLabel:string, base:LayerModel[]):LayerModel[]{
  const idx = ["14 Jan 2018","22 Jul 2019","03 Mar 2020","17 Sep 2021","14 Sep 2022","08 Apr 2023","19 Nov 2024","12 Feb 2025","28 Aug 2026"].indexOf(dateLabel);
  const hash = idx>=0 ? idx : dateLabel.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%9;
  return base.map((l,i)=>({...l, opacity: Math.max(0.2, Math.min(0.9, l.opacity + ((hash+i)%3 -1)*0.12)), order: (l.order + hash)%5 }));
}
function addOverlayForDate(group:L.LayerGroup, state:MapState, layers:LayerModel[], dateLabel:string){
  group.clearLayers();
  const hash = dateLabel.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % 7;
  if(state.aoi.length>=3)L.polygon(state.aoi,{...aoiStyle, fillOpacity: 0.2 + (hash%3)*0.05}).bindTooltip(`Current AOI · ${dateLabel} · DEMO DATA`).addTo(group);
  if(state.point)L.circleMarker(state.point,{radius:7+ (hash%3),color:'#5E7892',fillColor:'#A7B7C6',fillOpacity:1}).bindTooltip(`Selected point · ${state.point[0].toFixed(4)}, ${state.point[1].toFixed(4)} · ${dateLabel}`).addTo(group);
  const dateLayers = layersForDate(dateLabel, layers);
  dateLayers.filter(layer=>layer.visible).sort((a,b)=>a.order-b.order).forEach((layer,index)=>{
    const r = 4300 - index*280 + (hash*90) % 600 - 200;
    L.circle(featureAnchors[index%featureAnchors.length],{radius: Math.max(800, r), color:layer.color, weight:2, fillColor:layer.color, fillOpacity: Math.max(.06, layer.opacity*.16)}).bindTooltip(`${layer.name} · ${dateLabel} · DEMO DATA`).addTo(group);
  });
}
export function CompareMapPair({state,layers,fromLabel,toLabel}:{state:MapState;layers:LayerModel[];fromLabel:string;toLabel:string}){
  const left=useRef<HTMLDivElement>(null),right=useRef<HTMLDivElement>(null),divider=useRef<HTMLDivElement>(null),maps=useRef<[L.Map,L.Map]|null>(null),syncing=useRef(false);
  useEffect(()=>{if(!left.current||!right.current)return;const make=(host:HTMLDivElement)=>L.map(host,{zoomControl:false,attributionControl:false}).setView(state.center,state.zoom);const first=make(left.current),second=make(right.current);[first,second].forEach(map=>L.tileLayer(tiles[state.basemap].url,{maxZoom:19}).addTo(map));L.control.zoom({position:'bottomright'}).addTo(first);L.control.zoom({position:'bottomright'}).addTo(second);const sync=(source:L.Map,target:L.Map)=>{if(syncing.current)return;syncing.current=true;target.setView(source.getCenter(),source.getZoom(),{animate:false});requestAnimationFrame(()=>{syncing.current=false})};const bindSync=(a:L.Map,b:L.Map)=>{a.on('move',()=>sync(a,b));a.on('zoom',()=>sync(a,b));a.on('moveend',()=>sync(a,b));a.on('zoomend',()=>sync(a,b));};bindSync(first,second);bindSync(second,first);maps.current=[first,second];const t=setTimeout(()=>{first.invalidateSize({pan:false}); second.invalidateSize({pan:false});},100);return()=>{clearTimeout(t);first.remove();second.remove();maps.current=null}},[]);
  useEffect(()=>{if(!maps.current)return;const [first,second]=maps.current;const g1=L.layerGroup().addTo(first);const g2=L.layerGroup().addTo(second);addOverlayForDate(g1,state,layers,fromLabel);addOverlayForDate(g2,state,layers,toLabel);return()=>{first.removeLayer(g1); second.removeLayer(g2);}},[state.aoi,state.point,layers,fromLabel,toLabel]);
  function resize(event:React.PointerEvent){event.preventDefault();const host=divider.current?.parentElement;if(!host)return;const move=(pointer:PointerEvent)=>{const rect=host.getBoundingClientRect(),percent=Math.max(20,Math.min(80,(pointer.clientX-rect.left)/rect.width*100));host.style.setProperty('--compare-split',`${percent}%`);if(maps.current){maps.current[0].invalidateSize({pan:false}); maps.current[1].invalidateSize({pan:false});}};const up=()=>{window.removeEventListener('pointermove',move);if(maps.current){maps.current[0].invalidateSize({pan:false}); maps.current[1].invalidateSize({pan:false});}};window.addEventListener('pointermove',move);window.addEventListener('pointerup',up,{once:true})}
  return <div className="compare-map-pair"><section className="compare-map-side"><header>FROM · {fromLabel}</header><div className="compare-map-canvas" ref={left}/></section><div className="compare-divider" ref={divider} onPointerDown={resize}><span>↔</span></div><section className="compare-map-side"><header>TO · {toLabel}</header><div className="compare-map-canvas" ref={right}/></section></div>;
}
