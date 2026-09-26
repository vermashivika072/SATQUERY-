export type GeoFeatureCollection = {
  type: 'FeatureCollection';
  features: any[];
};

export type User = {
  id: string;
  email: string;
  username: string;
  role: string;
};

export type MessageVersion = {
  text: string;
  time: string;
  rag_sources?: {
    filename: string;
    snippet: string;
  }[];
};

export type Message = {
  role: 'user' | 'assistant';
  text: string;
  time: string;
  rag_sources?: {
    filename: string;
    snippet: string;
  }[];
  provenance?: Record<string, any>;
  turnId?: string;
  versions?: MessageVersion[];
  activeVersion?: number;
};

export type Chat = {
  id: string;
  title: string;
  titleIsAuto?: boolean;
  time: string;
  context: string;
  aoi: string;
  messages: Message[];
};

export type Note = {
  id: string;
  title: string;
  detail: string;
  time: string;
  severity?: 'critical' | 'info';
};

export type WindowType =
  | 'mission'
  | 'spectral'
  | 'story'
  | 'explain'
  | 'report'
  | 'change';

export type Win = {
  id: string;
  title: string;
  type: WindowType;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  hidden: boolean;
};

export type Tool = 'point' | 'rect' | null;