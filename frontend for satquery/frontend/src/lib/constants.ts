import type { LayerModel } from '../maps/MapWorkspace';
import type { WindowType } from '../types';

export const WINDOW_DEFS: {
  id: WindowType;
  title: string;
  type: WindowType;
}[] = [
    {
      id: 'mission',
      title: 'Mission',
      type: 'mission'
    },
    {
      id: 'spectral',
      title: 'Spectral',
      type: 'spectral'
    },
    {
      id: 'story',
      title: 'Story',
      type: 'story'
    },
    {
      id: 'explain',
      title: 'Explain Area',
      type: 'explain'
    },
    {
      id: 'report',
      title: 'Mission Report',
      type: 'report'
    },
    {
      id: 'change',
      title: 'Change Detection',
      type: 'change'
    }
  ];

export const titleToType = (
  title: string
): WindowType => {
  const t = title.toLowerCase();

  if (t.includes('spectral')) return 'spectral';
  if (t.includes('change')) return 'change';
  if (t.includes('story')) return 'story';
  if (
    t.includes('explain') ||
    t.includes('parcel')
  ) {
    return 'explain';
  }
  if (
    t.includes('report') ||
    t.includes('mission report')
  ) {
    return 'report';
  }
  if (t.includes('mission')) return 'mission';
  if (t.includes('ai insights')) return 'mission';
  if (t.includes('spatial')) return 'explain';
  if (t.includes('layer')) return 'spectral';

  return 'mission';
};

export const domains = [
  'Satellite / AI',
  'Urban Parcel',
  'Disaster Intelligence',
  'Weather Intelligence'
];

export const timelineDates = [
  '14 Jan 2018',
  '22 Jul 2019',
  '03 Mar 2020',
  '17 Sep 2021',
  '14 Sep 2022',
  '08 Apr 2023',
  '19 Nov 2024',
  '12 Feb 2025',
  '28 Aug 2026'
];

export const domainDefaultLayers: Record<
  string,
  string[]
> = {
  'Satellite / AI': ['s2', 'ndvi'],
  'Urban Parcel': ['parcel'],
  'Disaster Intelligence': [
    'flood',
    'weather'
  ],
  'Weather Intelligence': ['weather']
};

export const baseLayers: LayerModel[] = [
  {
    id: 's2',
    name: 'Sentinel-2 Observation',
    color: '#5E7892',
    visible: true,
    opacity: 0.7,
    order: 0,
    demo: false
  },
  {
    id: 'ndvi',
    name: 'NDVI Vegetation',
    color: '#6c9a62',
    visible: true,
    opacity: 0.72,
    order: 1,
    demo: false
  },
  {
    id: 'flood',
    name: 'Flood Hazard',
    color: '#c46d55',
    visible: false,
    opacity: 0.7,
    order: 2,
    demo: false
  },
  {
    id: 'parcel',
    name: 'Parcel Boundaries',
    color: '#3b82f6',
    visible: false,
    opacity: 0.65,
    order: 3,
    demo: false
  },
  {
    id: 'weather',
    name: 'Weather Anomaly',
    color: '#778ba1',
    visible: false,
    opacity: 0.6,
    order: 4,
    demo: false
  }
];