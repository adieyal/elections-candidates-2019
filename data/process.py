import csv
import json
from statistics import median


def clean_names(name):
    name = name.replace("SOUTH AFRICAN MAINTANANCE AND ESTATE BENEFICIARIES ASSOCIATI", "SOUTH AFRICAN MAINTANANCE AND ESTATE BENEFICIARIES ASSOCIATION")
    name = name.title()
    name = name.replace("'S", "'s")

    return name


def extract_gender(idno):
    return "female" if idno[6] < "5" else "male"

def extract_age(idno):
    birth_year = int(idno[0:2]) + 1900
    if birth_year <= 1901:
        birth_year += 100

    return 2019 - birth_year

parties = {}
for row in csv.DictReader(open("all.csv")):
    party = row["Party name"]
    idno = row["IDNumber"]
    gender = extract_gender(idno)
    age = extract_age(idno)
    order = row["Order number"]
    
    if not party in parties:
        parties[party] = {
            "male" : 0,
            "female" : 0,
            "ages" : []
        }
    parties[party][gender] += 1
    parties[party]["ages"].append((order, gender, age))
    
output = []
for party in parties:
    ordered = sorted(parties[party]["ages"], key=lambda x: x[0])
    genders = [tpl[1] for tpl in ordered]
    ages = [tpl[2] for tpl in ordered]
    top10_male = sum(1 for gender in genders[0:10] if gender == "male")
    top10_female = sum(1 for gender in genders[0:10] if gender == "female")

    parties[party]["medianAge"] = median(ages)
    parties[party]["party"] = clean_names(party)
    parties[party]["total"] = len(parties[party]["ages"])
    parties[party]["femaleRatio"] = round(parties[party]["female"] / parties[party]["total"], 2)
    parties[party]["top10Male"] = top10_male
    parties[party]["top10Female"] = top10_female
    parties[party]["top10FemaleRatio"] = round(top10_female / (top10_male + top10_female), 2)

    del parties[party]["ages"]
    output.append(parties[party])
output = sorted(output, key=lambda el : el["total"], reverse=True)
print(json.dumps(output, indent=4))
