import { Request, Response } from "express";
import { db } from "../db";
import { School } from "../db/schema";
import { eq } from "drizzle-orm";

export const createSchool = async (req: Request, res: Response) => {
  try {
    const { name, school_code, address, contact_email, contact_phone, logo } =
      req.body;

    const existingSchool = await db
      .select()
      .from(School)
      .where(eq(School.name, name));

    if (existingSchool.length > 0) {
      return res
        .status(400)
        .json({ message: "School with this name already exists" });
    }

    if (school_code) {
      const codeCheck = await db
        .select()
        .from(School)
        .where(eq(School.school_code, school_code));
      if (codeCheck.length > 0) {
        return res
          .status(400)
          .json({ message: "School with this school code already exists" });
      }
    }

    await db.insert(School).values({
      name,
      school_code,
      address,
      contact_email,
      contact_phone,
      logo,
    });

    res.status(201).json({ message: "School created successfully" });
  } catch (error) {
    console.error("Error creating school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getAllSchools = async (req: Request, res: Response) => {
  try {
    const schools = await db.select().from(School);
    res.status(200).json(schools);
  } catch (error) {
    console.error("Error fetching schools:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const getSchoolById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const schools = await db
      .select()
      .from(School)
      .where(eq(School.school_id, Number(id)));

    if (schools.length === 0) {
      return res.status(404).json({ message: "School not found" });
    }

    res.status(200).json(schools[0]);
  } catch (error) {
    console.error("Error fetching school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const updateSchool = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const {
      name,
      school_code,
      address,
      contact_email,
      contact_phone,
      logo,
      status,
    } = req.body;

    const existingSchool = await db
      .select()
      .from(School)
      .where(eq(School.school_id, Number(id)));

    if (existingSchool.length === 0) {
      return res.status(404).json({ message: "School not found" });
    }

    // Check name collision if name is changing
    if (name && name !== existingSchool[0].name) {
      const nameCheck = await db
        .select()
        .from(School)
        .where(eq(School.name, name));
      if (nameCheck.length > 0) {
        return res
          .status(400)
          .json({ message: "School with this name already exists" });
      }
    }

    // Check school code collision if it's changing
    if (school_code && school_code !== existingSchool[0].school_code) {
      const codeCheck = await db
        .select()
        .from(School)
        .where(eq(School.school_code, school_code));
      if (codeCheck.length > 0) {
        return res
          .status(400)
          .json({ message: "School with this school code already exists" });
      }
    }

    await db
      .update(School)
      .set({
        name,
        school_code,
        address,
        contact_email,
        contact_phone,
        logo,
        status,
      })
      .where(eq(School.school_id, Number(id)));

    res.status(200).json({ message: "School updated successfully" });
  } catch (error) {
    console.error("Error updating school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

export const deleteSchool = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    // Soft delete or hard delete? Usually soft delete is better, keeping logic consistent with schema ENUM
    // Schema has 'INACTIVE' or 'SUSPENDED', no specific 'DELETED' but let's assume we can change status or hard delete if no refs.
    // For now, let's just set to INACTIVE.

    await db
      .update(School)
      .set({ status: "INACTIVE" })
      .where(eq(School.school_id, Number(id)));

    res.status(200).json({ message: "School deactivated successfully" });
  } catch (error) {
    console.error("Error deleting school:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
