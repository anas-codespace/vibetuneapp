export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      feed_cache: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          payload: Json
          section: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string
          id?: string
          payload: Json
          section: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          payload?: Json
          section?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feed_errors: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          message: string
          section: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          section?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          section?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      liked_songs: {
        Row: {
          artist: string
          created_at: string
          id: string
          thumbnail_url: string | null
          title: string
          user_id: string
          youtube_id: string
        }
        Insert: {
          artist: string
          created_at?: string
          id?: string
          thumbnail_url?: string | null
          title: string
          user_id: string
          youtube_id: string
        }
        Update: {
          artist?: string
          created_at?: string
          id?: string
          thumbnail_url?: string | null
          title?: string
          user_id?: string
          youtube_id?: string
        }
        Relationships: []
      }
      listening_events: {
        Row: {
          artist: string
          context_lang: string | null
          end_reason: string
          ended_at: string | null
          hour_local: number
          id: string
          listened_ms: number
          source: string
          started_at: string
          title: string
          track_ms: number
          user_id: string
          youtube_id: string
        }
        Insert: {
          artist?: string
          context_lang?: string | null
          end_reason?: string
          ended_at?: string | null
          hour_local?: number
          id?: string
          listened_ms?: number
          source?: string
          started_at?: string
          title: string
          track_ms?: number
          user_id: string
          youtube_id: string
        }
        Update: {
          artist?: string
          context_lang?: string | null
          end_reason?: string
          ended_at?: string | null
          hour_local?: number
          id?: string
          listened_ms?: number
          source?: string
          started_at?: string
          title?: string
          track_ms?: number
          user_id?: string
          youtube_id?: string
        }
        Relationships: []
      }
      listening_history: {
        Row: {
          artist: string
          id: string
          played_at: string
          title: string
          user_id: string
          youtube_id: string
        }
        Insert: {
          artist: string
          id?: string
          played_at?: string
          title: string
          user_id: string
          youtube_id: string
        }
        Update: {
          artist?: string
          id?: string
          played_at?: string
          title?: string
          user_id?: string
          youtube_id?: string
        }
        Relationships: []
      }
      playlist_songs: {
        Row: {
          artist: string
          created_at: string
          id: string
          playlist_id: string
          position: number
          thumbnail_url: string | null
          title: string
          user_id: string
          youtube_id: string
        }
        Insert: {
          artist: string
          created_at?: string
          id?: string
          playlist_id: string
          position?: number
          thumbnail_url?: string | null
          title: string
          user_id: string
          youtube_id: string
        }
        Update: {
          artist?: string
          created_at?: string
          id?: string
          playlist_id?: string
          position?: number
          thumbnail_url?: string | null
          title?: string
          user_id?: string
          youtube_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "playlist_songs_playlist_id_fkey"
            columns: ["playlist_id"]
            isOneToOne: false
            referencedRelation: "playlists"
            referencedColumns: ["id"]
          },
        ]
      }
      playlists: {
        Row: {
          cover_image: string | null
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cover_image?: string | null
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cover_image?: string | null
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          bio: string | null
          created_at: string
          display_name: string | null
          fav_artists: Json
          fav_languages: string[]
          id: string
          onboarded: boolean
          profile_pic_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          fav_artists?: Json
          fav_languages?: string[]
          id?: string
          onboarded?: boolean
          profile_pic_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_name?: string | null
          fav_artists?: Json
          fav_languages?: string[]
          id?: string
          onboarded?: boolean
          profile_pic_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      search_events: {
        Row: {
          created_at: string
          id: string
          language: string | null
          normalized_query: string
          raw_query: string
          resulted_in_play: boolean
          top_result_youtube_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          language?: string | null
          normalized_query: string
          raw_query: string
          resulted_in_play?: boolean
          top_result_youtube_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          language?: string | null
          normalized_query?: string
          raw_query?: string
          resulted_in_play?: boolean
          top_result_youtube_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      songs: {
        Row: {
          artist: string
          created_at: string
          duration_seconds: number | null
          id: string
          is_embeddable: boolean
          mood_tag: string | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          youtube_id: string
        }
        Insert: {
          artist: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_embeddable?: boolean
          mood_tag?: string | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          youtube_id: string
        }
        Update: {
          artist?: string
          created_at?: string
          duration_seconds?: number | null
          id?: string
          is_embeddable?: boolean
          mood_tag?: string | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          youtube_id?: string
        }
        Relationships: []
      }
      spotify_tokens: {
        Row: {
          access_token: string
          created_at: string
          expires_at: string
          id: string
          refresh_token: string
          scope: string | null
          spotify_display_name: string | null
          spotify_user_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          created_at?: string
          expires_at: string
          id?: string
          refresh_token: string
          scope?: string | null
          spotify_display_name?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          created_at?: string
          expires_at?: string
          id?: string
          refresh_token?: string
          scope?: string | null
          spotify_display_name?: string | null
          spotify_user_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_taste_cache: {
        Row: {
          computed_at: string
          feed: Json
          profile: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          computed_at?: string
          feed?: Json
          profile?: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          computed_at?: string
          feed?: Json
          profile?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_taste_profile: {
        Row: {
          artists: Json
          created_at: string
          discovery_openness: number
          genres: Json
          id: string
          languages: Json
          recomputed_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          artists?: Json
          created_at?: string
          discovery_openness?: number
          genres?: Json
          id?: string
          languages?: Json
          recomputed_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          artists?: Json
          created_at?: string
          discovery_openness?: number
          genres?: Json
          id?: string
          languages?: Json
          recomputed_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      youtube_search_cache: {
        Row: {
          cached_at: string
          query: string
          results: Json
        }
        Insert: {
          cached_at?: string
          query: string
          results: Json
        }
        Update: {
          cached_at?: string
          query?: string
          results?: Json
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      recalculate_taste_profile: {
        Args: { _user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
