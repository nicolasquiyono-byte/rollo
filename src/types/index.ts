export type RevealType = 'instant' | 'delayed';
export type FilterType = 'original' | 'vintage' | 'bw' | 'special' | 'retro';

export type Rollo = {
  id: string;
  code: string;
  name: string;
  cover_image_url: string | null;
  host_id: string | null;
  host_name: string | null;
  shot_limit: number;
  max_guests: number;
  photos_visible_to_all: boolean;
  reveal_type: RevealType;
  opens_at: string;
  closes_at: string;
  reveals_at: string | null;
  filter: FilterType;
  created_at: string;
}

export type Guest = {
  id: string;
  rollo_id: string;
  name: string;
  device_id: string;
  shots_used: number;
  joined_at: string;
}

export type Photo = {
  id: string;
  rollo_id: string;
  guest_id: string;
  storage_path: string;
  width: number | null;
  height: number | null;
  size_bytes: number | null;
  filter: FilterType;
  taken_at: string;
}

export type QueuedPhoto = {
  id: string;
  rollo_id: string;
  guest_id: string;
  blob: Blob;
  width: number;
  height: number;
  filter: FilterType;
  taken_at: string;
}

export type Database = {
  public: {
    Tables: {
      rollos: {
        Row: Rollo;
        Insert: Omit<Rollo, 'id' | 'created_at' | 'opens_at'> & {
          id?: string;
          created_at?: string;
          opens_at?: string;
        };
        Update: Partial<Rollo>;
        Relationships: [];
      };
      guests: {
        Row: Guest;
        Insert: Omit<Guest, 'id' | 'joined_at' | 'shots_used'> & {
          id?: string;
          joined_at?: string;
          shots_used?: number;
        };
        Update: Partial<Guest>;
        Relationships: [
          {
            foreignKeyName: 'guests_rollo_id_fkey';
            columns: ['rollo_id'];
            isOneToOne: false;
            referencedRelation: 'rollos';
            referencedColumns: ['id'];
          },
        ];
      };
      photos: {
        Row: Photo;
        Insert: Omit<Photo, 'id' | 'taken_at'> & {
          id?: string;
          taken_at?: string;
        };
        Update: Partial<Photo>;
        Relationships: [
          {
            foreignKeyName: 'photos_rollo_id_fkey';
            columns: ['rollo_id'];
            isOneToOne: false;
            referencedRelation: 'rollos';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'photos_guest_id_fkey';
            columns: ['guest_id'];
            isOneToOne: false;
            referencedRelation: 'guests';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
    Functions: {
      create_rollo: {
        Args: {
          p_code: string;
          p_name: string;
          p_host_name: string | null;
          p_shot_limit: number;
          p_reveal_type: RevealType;
          p_closes_at: string;
          p_reveals_at: string | null;
          p_cover_image_url: string | null;
          p_filter: FilterType;
          p_max_guests: number;
          p_photos_visible_to_all: boolean;
        };
        Returns: { id: string; code: string; admin_token: string };
      };
      get_rollo_by_admin_token: {
        Args: { p_token: string };
        Returns: Rollo;
      };
      close_rollo_now: {
        Args: { p_token: string };
        Returns: Rollo;
      };
      reveal_rollo_now: {
        Args: { p_token: string };
        Returns: Rollo;
      };
      update_reveal_settings: {
        Args: {
          p_token: string;
          p_reveal_type: 'instant' | 'delayed';
          p_reveals_at: string | null;
        };
        Returns: Rollo;
      };
    };
  };
}
