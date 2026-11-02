/**
 * Supabase Database Type Definitions
 * Auto-compatible with PostgreSQL schema in supabase/migrations/20261102000000_shared_foundation.sql
 */

import {
  Store,
  Profile,
  Product,
  Cart,
  CartSession,
  CartItem,
  Lane,
  LaneAssignment,
  DiscountRule,
  CheckoutTransaction,
  AuditLog,
} from './domain';

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
      };
      profiles: {
        Row: Profile;
        Insert: Omit<Profile, 'created_at' | 'updated_at'> & {
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Profile, 'id'>>;
      };
      products: {
        Row: Product;
        Insert: Omit<Product, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Product, 'id'>>;
      };
      carts: {
        Row: Cart;
        Insert: Omit<Cart, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Cart, 'id'>>;
      };
      lanes: {
        Row: Lane;
        Insert: Omit<Lane, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<Lane, 'id'>>;
      };
      cart_sessions: {
        Row: CartSession;
        Insert: Omit<CartSession, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<CartSession, 'id'>>;
      };
      cart_items: {
        Row: CartItem;
        Insert: Omit<CartItem, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<CartItem, 'id'>>;
      };
      discount_rules: {
        Row: DiscountRule;
        Insert: Omit<DiscountRule, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<DiscountRule, 'id'>>;
      };
      lane_assignments: {
        Row: LaneAssignment;
        Insert: Omit<LaneAssignment, 'id' | 'created_at' | 'updated_at'> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<LaneAssignment, 'id'>>;
      };
      checkout_transactions: {
        Row: CheckoutTransaction;
        Insert: Omit<CheckoutTransaction, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<CheckoutTransaction, 'id'>>;
      };
      audit_logs: {
        Row: AuditLog;
        Insert: Omit<AuditLog, 'id' | 'created_at'> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<AuditLog, 'id'>>;
      };
    };
  };
}
