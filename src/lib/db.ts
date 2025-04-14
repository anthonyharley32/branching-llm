import { supabase } from './supabase';
import { TableName, Tables } from '../types/database';

// Type for query parameters
export type QueryParams = {
  select?: string;
  eq?: Record<string, any>;
  neq?: Record<string, any>;
  in?: Record<string, any[]>;
  gt?: Record<string, any>;
  lt?: Record<string, any>;
  gte?: Record<string, any>;
  lte?: Record<string, any>;
  filters?: (query: any) => any;
  order?: { column: string; ascending?: boolean };
  limit?: number;
  offset?: number;
  range?: { from: number; to: number };
};

/**
 * Fetch data from a Supabase table
 * @param table The table to fetch from
 * @param query Query parameters
 * @returns The fetched data or throws an error
 */
export async function fetchData<T extends TableName>(
  table: T, 
  query: QueryParams = {}
): Promise<Tables[T][]> {
  const { 
    select, eq, neq, in: inParam, gt, lt, gte, lte, 
    filters, order, limit, offset, range 
  } = query;
  
  let queryBuilder = supabase.from(table).select(select || '*');
  
  // Apply equals filters
  if (eq) {
    Object.entries(eq).forEach(([column, value]) => {
      queryBuilder = queryBuilder.eq(column, value);
    });
  }

  // Apply not-equals filters
  if (neq) {
    Object.entries(neq).forEach(([column, value]) => {
      queryBuilder = queryBuilder.neq(column, value);
    });
  }

  // Apply in filters
  if (inParam) {
    Object.entries(inParam).forEach(([column, values]) => {
      queryBuilder = queryBuilder.in(column, values);
    });
  }

  // Apply comparison filters
  if (gt) {
    Object.entries(gt).forEach(([column, value]) => {
      queryBuilder = queryBuilder.gt(column, value);
    });
  }

  if (lt) {
    Object.entries(lt).forEach(([column, value]) => {
      queryBuilder = queryBuilder.lt(column, value);
    });
  }

  if (gte) {
    Object.entries(gte).forEach(([column, value]) => {
      queryBuilder = queryBuilder.gte(column, value);
    });
  }

  if (lte) {
    Object.entries(lte).forEach(([column, value]) => {
      queryBuilder = queryBuilder.lte(column, value);
    });
  }
  
  // Apply custom filters if provided
  if (filters) {
    queryBuilder = filters(queryBuilder);
  }
  
  // Apply ordering if provided
  if (order) {
    const { column, ascending = true } = order;
    queryBuilder = queryBuilder.order(column, { ascending });
  }
  
  // Apply pagination
  if (limit) {
    queryBuilder = queryBuilder.limit(limit);
  }
  
  if (offset) {
    queryBuilder = queryBuilder.range(offset, offset + (limit || 10) - 1);
  }

  if (range) {
    queryBuilder = queryBuilder.range(range.from, range.to);
  }
  
  const { data, error } = await queryBuilder;
  
  if (error) {
    console.error(`Error fetching data from ${table}:`, error);
    throw error;
  }
  
  return data as unknown as Tables[T][];
}

/**
 * Insert data into a Supabase table
 * @param table The table to insert into
 * @param data The data to insert
 * @param returnValue Whether to return the inserted data
 * @returns The inserted data or true if successful
 */
export async function insertData<T extends TableName>(
  table: T, 
  data: Partial<Tables[T]>, 
  returnValue: boolean = true
): Promise<Tables[T] | boolean> {
  const query = supabase.from(table).insert(data);
  
  const { data: result, error } = returnValue 
    ? await query.select().single()
    : await query;
  
  if (error) {
    console.error(`Error inserting data into ${table}:`, error);
    throw error;
  }
  
  return returnValue ? result as Tables[T] : true;
}

/**
 * Update data in a Supabase table
 * @param table The table to update
 * @param id The ID of the record to update
 * @param data The data to update
 * @param returnValue Whether to return the updated data
 * @returns The updated data or true if successful
 */
export async function updateData<T extends TableName>(
  table: T, 
  id: string, 
  data: Partial<Tables[T]>, 
  returnValue: boolean = true
): Promise<Tables[T] | boolean> {
  const query = supabase.from(table).update(data).eq('id', id);
  
  const { data: result, error } = returnValue 
    ? await query.select().single()
    : await query;
  
  if (error) {
    console.error(`Error updating data in ${table}:`, error);
    throw error;
  }
  
  return returnValue ? result as Tables[T] : true;
}

/**
 * Delete data from a Supabase table
 * @param table The table to delete from
 * @param id The ID of the record to delete
 * @returns True if the deletion was successful
 */
export async function deleteData(table: TableName, id: string): Promise<boolean> {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);
  
  if (error) {
    console.error(`Error deleting data from ${table}:`, error);
    throw error;
  }
  
  return true;
}

/**
 * Get a single record by ID
 * @param table The table to fetch from
 * @param id The ID of the record to fetch
 * @param select Optional columns to select
 * @returns The fetched record or null if not found
 */
export async function getById<T extends TableName>(
  table: T, 
  id: string, 
  select?: string
): Promise<Tables[T] | null> {
  const { data, error } = await supabase
    .from(table)
    .select(select || '*')
    .eq('id', id)
    .single();
  
  if (error) {
    if (error.code === 'PGRST116') {
      // Record not found, return null
      return null;
    }
    console.error(`Error fetching data from ${table}:`, error);
    throw error;
  }
  
  return data as unknown as Tables[T];
}

/**
 * Upsert data (insert if not exists, update if exists)
 * @param table The table to upsert into
 * @param data The data to upsert
 * @param constraintField The field to match on (default: 'id')
 * @param returnValue Whether to return the upserted data
 * @returns The upserted data or true if successful
 */
export async function upsertData<T extends TableName>(
  table: T, 
  data: Partial<Tables[T]>, 
  constraintField: string = 'id',
  returnValue: boolean = true
): Promise<Tables[T] | boolean> {
  const query = supabase
    .from(table)
    .upsert(data, { onConflict: constraintField });
  
  const { data: result, error } = returnValue 
    ? await query.select().single()
    : await query;
  
  if (error) {
    console.error(`Error upserting data in ${table}:`, error);
    throw error;
  }
  
  return returnValue ? result as Tables[T] : true;
} 