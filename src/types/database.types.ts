/**
 * Supabase Database Type Definitions
 * Auto-compatible with PostgreSQL schema in supabase/migrations/20261102000000_shared_foundation.sql
 */

import type { Store, Profile, Product, Cart, CartSession, CartItem, Lane, LaneAssignment, DiscountRule, CheckoutTransaction, AuditLog } from './domain.ts';

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  public: {
    Tables: {
      stores: {
        Row: Store;
        Insert: Omit<Store, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Store, 'id'>>;
        Relationships: [];
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, 'id'>>;
        Relationships: [];
      };
      products: {
        Row: Product;
        Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Product, 'id'>>;
        Relationships: [];
      };
      carts: {
        Row: Cart;
        Insert: Omit<Cart, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Cart, 'id'>>;
        Relationships: [];
      };
      lanes: {
        Row: Lane;
        Insert: Omit<Lane, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Lane, 'id'>>;
        Relationships: [];
      };
      cart_sessions: {
        Row: CartSession;
        Insert: Omit<CartSession, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<CartSession, 'id'>>;
        Relationships: [];
      };
      cart_items: {
        Row: CartItem;
        Insert: Omit<CartItem, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<CartItem, 'id'>>;
        Relationships: [];
      };
      discount_rules: {
        Row: DiscountRule;
        Insert: Omit<DiscountRule, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DiscountRule, 'id'>>;
        Relationships: [];
      };
      lane_assignments: {
        Row: LaneAssignment;
        Insert: Omit<LaneAssignment, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<LaneAssignment, 'id'>>;
        Relationships: [];
      };
      checkout_transactions: {
        Row: CheckoutTransaction;
        Insert: Omit<CheckoutTransaction, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<CheckoutTransaction, 'id'>>;
        Relationships: [];
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<AuditLog, 'id'>>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      assign_cart_to_lane: {
        Args: {
          p_session_id: string;
          p_lane_id: string;
          p_token_number: string;
          p_estimated_wait_seconds: number;
        };
        Returns: {
          success: boolean;
          already_assigned?: boolean;
          assignment_id?: string;
          token_number?: string;
          queue_position?: number;
          estimated_wait_seconds?: number;
          lane_id?: string;
          lane_name?: string;
          lane_type?: string;
          session_status?: string;
          error_code?: string;
          message?: string;
        };
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
}
