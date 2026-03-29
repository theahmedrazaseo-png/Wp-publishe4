export interface WPConfig {
  url: string;
  username: string;
  applicationPassword: string;
}

export interface Article {
  title: string;
  content: string;
  meta_title?: string;
  meta_description?: string;
  slug?: string;
  categories?: number[];
  tags?: number[];
  featured_image_url?: string;
  status: 'publish' | 'draft' | 'future' | 'pending' | 'private';
  date?: string;
}

export interface PublishResult {
  title: string;
  status: 'success' | 'failed';
  id?: number;
  link?: string;
  error?: string;
}
