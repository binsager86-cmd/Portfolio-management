import { FormField, SegmentedControl } from "@/components/form";
import React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PORTFOLIOS, TXN_TYPES, type TxnFormValues } from "../transactionSchema";

export function Step1Type() {
  const { t } = useTranslation();
  const { control, formState: { errors } } = useFormContext<TxnFormValues>();

  return (
    <>
      <FormField label={t("addTransaction.portfolio")} required error={errors.portfolio?.message}>
        <Controller
          control={control}
          name="portfolio"
          render={({ field: { value, onChange } }) => (
            <SegmentedControl options={[...PORTFOLIOS]} value={value} onChange={onChange} />
          )}
        />
      </FormField>

      <FormField label={t("addTransaction.transactionType")} required error={errors.txn_type?.message}>
        <Controller
          control={control}
          name="txn_type"
          render={({ field: { value, onChange } }) => (
            <SegmentedControl options={[...TXN_TYPES]} value={value} onChange={onChange} />
          )}
        />
      </FormField>
    </>
  );
}
