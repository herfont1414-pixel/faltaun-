export type MenuCategory = "comidas" | "tragos" | "vinos" | "postres";

export interface MenuItem {
  id: string;
  name: string;
  description: string;
  price: number;
  image_url: string | null;
  category: MenuCategory;
  featured: boolean;
}

export interface Reservation {
  id?: string;
  name: string;
  phone: string;
  date: string;
  time: string;
  guests: number;
  notes?: string;
}
